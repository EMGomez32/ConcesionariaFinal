import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { BaseException } from '../../domain/exceptions/BaseException';
import { Col, sendCsv } from '../../utils/csv';

// ─────────────────────────────────────────────────────────────────────────────
// Reportes: consultas de solo lectura sobre datos ya existentes. Como el resto
// de endpoints de agregación (GastoController.total, etc.), usan `prisma`
// directamente en el controller. El RLS de la extensión filtra por tenant
// automáticamente, así que no hace falta pasar concesionariaId.
//
// Cada endpoint acepta `?format=csv` para descargar el mismo dato como CSV.
// El escape/armado del CSV vive en utils/csv (compartido con Auditoría).
// ─────────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number => Number(v ?? 0);

/**
 * Entero de un query param, validado. Antes se hacía `Number(x) || default`:
 * eso tapaba los errores en silencio (?anio=abc devolvía el año actual con un
 * 200, o sea el reporte de OTRO período sin avisar) y dejaba pasar valores
 * absurdos (?anio=-5 llegaba hasta el driver de Postgres y explotaba con un 500).
 */
function enteroEnRango(valor: unknown, min: number, max: number, porDefecto: number, campo: string): number {
    if (valor === undefined || valor === '') return porDefecto;
    const n = Number(valor);
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new BaseException(400, `${campo} debe ser un entero entre ${min} y ${max}`, 'VALIDATION_ERROR');
    }
    return n;
}

/** Id opcional de un query param. `?sucursalId=abc` daba NaN y terminaba en 500. */
function idOpcional(valor: unknown, campo: string): number | undefined {
    if (valor === undefined || valor === '') return undefined;
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1) {
        throw new BaseException(400, `${campo} inválido`, 'VALIDATION_ERROR');
    }
    return n;
}

/**
 * Agrupa importes por moneda para no sumar ARS con USD. Devuelve un array
 * [{ moneda, cantidad, <campo>: total, ... }] por cada moneda presente.
 */
function agruparPorMoneda<T extends Record<string, any>>(items: T[], campos: (keyof T)[]) {
    const map = new Map<string, any>();
    for (const it of items) {
        const m = String(it.moneda ?? 'ARS');
        if (!map.has(m)) {
            const base: any = { moneda: m, cantidad: 0 };
            for (const c of campos) base[c] = 0;
            map.set(m, base);
        }
        const acc = map.get(m);
        acc.cantidad += 1;
        for (const c of campos) acc[c] += num(it[c]);
    }
    return Array.from(map.values());
}

/**
 * Parsea desde/hasta (YYYY-MM-DD) a un rango INCLUSIVO sobre una columna
 * `@db.Date` (fechaVenta, gastoVehiculo.fecha, cuota.vencimiento...).
 *
 * Las fechas se construyen en UTC a propósito. Con `new Date('2026-07-04T23:59:59.999')`
 * —sin la Z— el server las interpreta en su hora local: en UTC-3 eso da
 * 2026-07-05T02:59Z, y como la columna es DATE, Prisma trunca y termina
 * comparando contra el 05. Efecto real y reproducido: pedir las ventas "hasta el
 * 04/07" devolvía la del 05/07, o sea que un reporte de junio se comía el 1° de
 * julio. En UTC, el 04 es el 04.
 */
function parseRango(query: any): { desde?: Date; hasta?: Date } {
    const out: { desde?: Date; hasta?: Date } = {};
    if (query.desde) {
        const d = new Date(`${query.desde}T00:00:00.000Z`);
        if (!isNaN(d.getTime())) out.desde = d;
    }
    if (query.hasta) {
        const h = new Date(`${query.hasta}T00:00:00.000Z`);
        if (!isNaN(h.getTime())) out.hasta = h;
    }
    return out;
}

/**
 * Rango sobre una columna `@db.Date`. Al ser fecha pura, `lte` con la fecha del
 * día ya incluye el día entero: no hace falta (ni sirve) el 23:59:59.
 */
function filtroFecha(campo: string, desde?: Date, hasta?: Date): Record<string, any> {
    if (!desde && !hasta) return {};
    const cond: any = {};
    if (desde) cond.gte = desde;
    if (hasta) cond.lte = hasta;
    return { [campo]: cond };
}

/**
 * Rango sobre una columna `DateTime` (con hora): ventaPago.fecha y
 * pagoCuota.fechaPago guardan el instante del cobro.
 *
 * Acá SÍ hay que abarcar el día LOCAL completo: un cobro del 05/07 a las 14:00
 * en Argentina se guarda como 17:00Z, así que el día va de 03:00Z del 05 a
 * 03:00Z del 06. Por eso el límite es `lt` (exclusivo) del día siguiente y no
 * `lte`: así no se pisan dos días ni se pierde ningún cobro del último.
 */
function filtroInstante(campo: string, desde?: Date, hasta?: Date): Record<string, any> {
    if (!desde && !hasta) return {};
    const cond: any = {};
    // Reinterpreta la fecha UTC como el arranque de ese día en hora local.
    const inicioLocal = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (desde) cond.gte = inicioLocal(desde);
    if (hasta) {
        const finExclusivo = inicioLocal(hasta);
        finExclusivo.setDate(finExclusivo.getDate() + 1);
        cond.lt = finExclusivo;
    }
    return { [campo]: cond };
}

// ─────────────────────────────────────────────────────────────────────────────
// Consolidación de monedas (opcional, ?consolidar=ARS|USD).
//
// Los reportes separan ARS de USD a propósito: sumarlos no significa nada sin una
// cotización. Cuando el usuario pide consolidar, se convierte todo a la moneda
// destino usando la ÚLTIMA cotización cargada ("el dólar de hoy") y se devuelve un
// total consolidado JUNTO al desglose por moneda (que se mantiene intacto para no
// perder la trazabilidad). Si no hay ninguna cotización cargada, se responde
// `sinCotizacion: true` y el front invita a cargarla.
// ─────────────────────────────────────────────────────────────────────────────

type MonedaConsolidacion = 'ARS' | 'USD';

/** Valida ?consolidar=. Ausente → null. Distinto de ARS/USD → 400. */
function parseConsolidar(query: any): MonedaConsolidacion | null {
    const c = query.consolidar;
    if (c === undefined || c === '') return null;
    if (c === 'ARS' || c === 'USD') return c;
    throw new BaseException(400, 'consolidar debe ser ARS o USD', 'VALIDATION_ERROR');
}

/** Convierte `monto` de `origen` a `destino` con `valor` (pesos por 1 USD). */
function convertir(monto: number, origen: string, destino: MonedaConsolidacion, valor: number): number {
    const m = num(monto);
    if (!m) return 0;
    if (origen === destino) return m;
    if (origen === 'USD' && destino === 'ARS') return m * valor;
    if (origen === 'ARS' && destino === 'USD') return m / valor;
    // El sistema sólo maneja ARS/USD; cualquier otra se deja sin convertir en vez
    // de inventar un número. No debería ocurrir en datos reales.
    return m;
}

/**
 * La cotización a usar para consolidar: la más reciente cargada por el tenant.
 * La extensión RLS inyecta el tenant para el admin; el super_admin ve la última
 * global (mismo criterio que el resto de reportes, que no acotan por tenant para él).
 */
async function getCotizacionParaConsolidar(): Promise<{ valor: number; fecha: string } | null> {
    const c = await prisma.cotizacion.findFirst({ orderBy: { fecha: 'desc' } });
    if (!c) return null;
    return { valor: num(c.valor), fecha: c.fecha.toISOString().slice(0, 10) };
}

/** Suma los buckets `porMoneda` convertidos a `destino`, campo por campo. */
function consolidarBuckets(
    porMoneda: any[],
    campos: string[],
    destino: MonedaConsolidacion,
    valor: number,
): Record<string, number> {
    const out: Record<string, number> = {};
    for (const c of campos) out[c] = 0;
    for (const b of porMoneda) {
        for (const c of campos) out[c] += convertir(num(b[c]), String(b.moneda ?? 'ARS'), destino, valor);
    }
    return out;
}

export class ReporteController {
    // ── 1. Ventas por período ────────────────────────────────────────────────
    // GET /api/reportes/ventas?desde=&hasta=&sucursalId=&vendedorId=&format=csv
    static async ventas(req: Request, res: Response, next: NextFunction) {
        try {
            const { desde, hasta } = parseRango(req.query);
            const where: any = { ...filtroFecha('fechaVenta', desde, hasta) };
            const sucursalId = idOpcional(req.query.sucursalId, 'sucursalId');
            const vendedorId = idOpcional(req.query.vendedorId, 'vendedorId');
            if (sucursalId) where.sucursalId = sucursalId;
            if (vendedorId) where.vendedorId = vendedorId;

            const ventas = await prisma.venta.findMany({
                where,
                orderBy: { fechaVenta: 'desc' },
                include: {
                    vehiculo: { select: { marca: true, modelo: true, dominio: true } },
                    cliente: { select: { nombre: true } },
                    vendedor: { select: { nombre: true } },
                    sucursal: { select: { nombre: true } },
                    // El filtro de borrados es obligatorio: la extensión sólo lo
                    // aplica al where de primer nivel, no dentro de un include.
                    // Sin esto, un extra anulado sigue sumando al total de la venta.
                    extras: { where: { deletedAt: null }, select: { monto: true } },
                },
            });

            const items = ventas.map((v) => {
                const extras = v.extras.reduce((s, e) => s + num(e.monto), 0);
                return {
                    id: v.id,
                    fecha: v.fechaVenta.toISOString().slice(0, 10),
                    vehiculo: `${v.vehiculo?.marca ?? ''} ${v.vehiculo?.modelo ?? ''}`.trim(),
                    dominio: v.vehiculo?.dominio ?? '',
                    cliente: v.cliente?.nombre ?? '',
                    vendedor: v.vendedor?.nombre ?? '',
                    sucursal: v.sucursal?.nombre ?? '',
                    formaPago: v.formaPago,
                    moneda: v.moneda,
                    precioVenta: num(v.precioVenta),
                    extras,
                    total: num(v.precioVenta) + extras,
                };
            });

            const resumen = {
                cantidad: items.length,
                porMoneda: agruparPorMoneda(items, ['precioVenta', 'extras', 'total']),
            };

            if (req.query.format === 'csv') {
                return sendCsv(res, 'reporte-ventas', [
                    { key: 'fecha', header: 'Fecha' },
                    { key: 'vehiculo', header: 'Vehículo' },
                    { key: 'dominio', header: 'Dominio' },
                    { key: 'cliente', header: 'Cliente' },
                    { key: 'vendedor', header: 'Vendedor' },
                    { key: 'sucursal', header: 'Sucursal' },
                    { key: 'formaPago', header: 'Forma de pago' },
                    { key: 'moneda', header: 'Moneda' },
                    { key: 'precioVenta', header: 'Precio venta' },
                    { key: 'extras', header: 'Extras' },
                    { key: 'total', header: 'Total' },
                ], items);
            }

            // Consolidación opcional a una sola moneda (?consolidar=ARS|USD).
            const consolidar = parseConsolidar(req.query);
            let consolidado: any = null;
            let sinCotizacion = false;
            if (consolidar) {
                const cot = await getCotizacionParaConsolidar();
                if (!cot) sinCotizacion = true;
                else consolidado = {
                    moneda: consolidar,
                    valor: cot.valor,
                    fechaCotizacion: cot.fecha,
                    cantidad: items.length,
                    ...consolidarBuckets(resumen.porMoneda, ['precioVenta', 'extras', 'total'], consolidar, cot.valor),
                };
            }

            res.json({ resumen, items, consolidado, sinCotizacion });
        } catch (error) {
            next(error);
        }
    }

    // ── 2. Caja mensual (ingresos vs egresos) ────────────────────────────────
    // GET /api/reportes/caja?anio=&mes=&format=csv
    static async caja(req: Request, res: Response, next: NextFunction) {
        try {
            const anio = enteroEnRango(req.query.anio, 2000, 2100, new Date().getFullYear(), 'anio');
            const mes = enteroEnRango(req.query.mes, 1, 12, new Date().getMonth() + 1, 'mes');

            // El mes local: un cobro del 1° a las 00:30 en Argentina se guarda
            // como 03:30Z del 1°, y uno del último día a las 23:00 como 02:00Z
            // del 1° del mes siguiente. La ventana se arma en hora local y el
            // límite es exclusivo, así que ningún cobro queda afuera ni se
            // cuenta en dos meses.
            const desde = new Date(anio, mes - 1, 1);
            const hasta = new Date(anio, mes, 1);
            const rangoInstante = (campo: string) => ({ [campo]: { gte: desde, lt: hasta } });
            // gastoVehiculo.fecha es @db.Date: se compara como fecha pura, en UTC.
            const desdeFecha = new Date(Date.UTC(anio, mes - 1, 1));
            const hastaFecha = new Date(Date.UTC(anio, mes, 1));

            // Cada pata se agrupa por moneda. VentaPago y PagoCuota no tienen
            // columna `moneda` propia: la heredan de la Venta y de la
            // Financiación, así que hay que traerla por la relación.
            const [pagosVenta, pagosCuota, gastosVeh, gastosFijos] = await Promise.all([
                prisma.ventaPago.findMany({
                    where: rangoInstante('fecha'),
                    select: { monto: true, venta: { select: { moneda: true } } },
                }),
                prisma.pagoCuota.findMany({
                    where: rangoInstante('fechaPago'),
                    select: { monto: true, cuota: { select: { financiacion: { select: { moneda: true } } } } },
                }),
                prisma.gastoVehiculo.groupBy({
                    by: ['moneda'],
                    _sum: { monto: true },
                    _count: { _all: true },
                    where: { fecha: { gte: desdeFecha, lt: hastaFecha } },
                }),
                prisma.gastoFijo.groupBy({
                    by: ['moneda'],
                    _sum: { monto: true },
                    _count: { _all: true },
                    where: { anio, mes },
                }),
            ]);

            // moneda -> { cobrosVentas, cobrosCuotas, gastosVehiculos, gastosFijos }
            const acc = new Map<string, any>();
            const bucket = (moneda: string) => {
                const m = moneda || 'ARS';
                if (!acc.has(m)) {
                    acc.set(m, {
                        moneda: m,
                        ingresos: { cobrosVentas: 0, cobrosCuotas: 0, total: 0 },
                        egresos: { gastosVehiculos: 0, gastosFijos: 0, total: 0 },
                        neto: 0,
                    });
                }
                return acc.get(m);
            };

            for (const p of pagosVenta) {
                bucket(p.venta?.moneda ?? 'ARS').ingresos.cobrosVentas += num(p.monto);
            }
            for (const p of pagosCuota) {
                bucket(p.cuota?.financiacion?.moneda ?? 'ARS').ingresos.cobrosCuotas += num(p.monto);
            }
            for (const g of gastosVeh) {
                bucket(g.moneda).egresos.gastosVehiculos += num(g._sum.monto);
            }
            for (const g of gastosFijos) {
                bucket(g.moneda).egresos.gastosFijos += num(g._sum.monto);
            }

            // El neto es POR MONEDA: un neto único mezclaría pesos con dólares.
            const porMoneda = Array.from(acc.values())
                .map((b) => {
                    b.ingresos.total = b.ingresos.cobrosVentas + b.ingresos.cobrosCuotas;
                    b.egresos.total = b.egresos.gastosVehiculos + b.egresos.gastosFijos;
                    b.neto = b.ingresos.total - b.egresos.total;
                    return b;
                })
                .sort((a, b) => String(a.moneda).localeCompare(String(b.moneda)));

            const resultado = { periodo: { anio, mes }, porMoneda };

            if (req.query.format === 'csv') {
                const filas = porMoneda.flatMap((b: any) => [
                    { moneda: b.moneda, concepto: 'Cobros de ventas', tipo: 'Ingreso', monto: b.ingresos.cobrosVentas },
                    { moneda: b.moneda, concepto: 'Cobros de cuotas', tipo: 'Ingreso', monto: b.ingresos.cobrosCuotas },
                    { moneda: b.moneda, concepto: 'Gastos de vehículos', tipo: 'Egreso', monto: b.egresos.gastosVehiculos },
                    { moneda: b.moneda, concepto: 'Gastos fijos', tipo: 'Egreso', monto: b.egresos.gastosFijos },
                    { moneda: b.moneda, concepto: 'NETO', tipo: '', monto: b.neto },
                ]);
                return sendCsv(res, `reporte-caja-${anio}-${String(mes).padStart(2, '0')}`, [
                    { key: 'moneda', header: 'Moneda' },
                    { key: 'concepto', header: 'Concepto' },
                    { key: 'tipo', header: 'Tipo' },
                    { key: 'monto', header: 'Monto' },
                ], filas);
            }

            // Consolidación opcional a una sola moneda (?consolidar=ARS|USD).
            const consolidar = parseConsolidar(req.query);
            let consolidado: any = null;
            let sinCotizacion = false;
            if (consolidar) {
                const cot = await getCotizacionParaConsolidar();
                if (!cot) {
                    sinCotizacion = true;
                } else {
                    const ingresos = { cobrosVentas: 0, cobrosCuotas: 0, total: 0 };
                    const egresos = { gastosVehiculos: 0, gastosFijos: 0, total: 0 };
                    for (const b of porMoneda) {
                        ingresos.cobrosVentas += convertir(b.ingresos.cobrosVentas, b.moneda, consolidar, cot.valor);
                        ingresos.cobrosCuotas += convertir(b.ingresos.cobrosCuotas, b.moneda, consolidar, cot.valor);
                        egresos.gastosVehiculos += convertir(b.egresos.gastosVehiculos, b.moneda, consolidar, cot.valor);
                        egresos.gastosFijos += convertir(b.egresos.gastosFijos, b.moneda, consolidar, cot.valor);
                    }
                    ingresos.total = ingresos.cobrosVentas + ingresos.cobrosCuotas;
                    egresos.total = egresos.gastosVehiculos + egresos.gastosFijos;
                    consolidado = {
                        moneda: consolidar,
                        valor: cot.valor,
                        fechaCotizacion: cot.fecha,
                        ingresos,
                        egresos,
                        neto: ingresos.total - egresos.total,
                    };
                }
            }

            res.json({ ...resultado, consolidado, sinCotizacion });
        } catch (error) {
            next(error);
        }
    }

    // ── 3. Cartera de mora (cuotas vencidas con saldo) ───────────────────────
    // GET /api/reportes/mora?format=csv
    static async mora(req: Request, res: Response, next: NextFunction) {
        try {
            // `vencimiento` es @db.Date (fecha pura, medianoche UTC). Compararla
            // contra `new Date()` —que trae la hora— hacía que una cuota que vence
            // HOY entrara como vencida con 0 días de atraso. El criterio es que el
            // cliente tiene todo el día del vencimiento para pagar: recién está en
            // mora cuando ese día pasó por completo. De ahí `lt` contra la
            // medianoche UTC de hoy, que además garantiza diasAtraso >= 1.
            const ahora = new Date();
            const inicioHoy = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));

            const cuotas = await prisma.cuota.findMany({
                where: {
                    vencimiento: { lt: inicioHoy },
                    saldoCuota: { gt: 0 },
                    estado: { not: 'pagada' },
                    // Una financiación borrada no tiene deuda cobrable. El filtro
                    // va acá y no dentro del include porque `financiacion` es una
                    // relación to-one obligatoria: Prisma no acepta `where` sobre
                    // ellas en un include (sólo sobre listas). Filtrar por la
                    // relación en el where de primer nivel descarta la cuota
                    // entera, que es justamente lo que se busca. La extensión de
                    // soft-delete no cubre esto: sólo mira el modelo consultado.
                    financiacion: { deletedAt: null },
                },
                orderBy: { vencimiento: 'asc' },
                include: {
                    financiacion: {
                        select: {
                            id: true,
                            moneda: true,
                            clienteId: true,
                            cliente: { select: { nombre: true, telefono: true } },
                            venta: { select: { vehiculo: { select: { marca: true, modelo: true, dominio: true } } } },
                        },
                    },
                },
            });

            const items = cuotas.map((c) => {
                // Días completos entre el vencimiento y hoy, ambos a medianoche UTC.
                const diasAtraso = Math.max(1, Math.round((inicioHoy.getTime() - c.vencimiento.getTime()) / 86400000));
                const veh = c.financiacion?.venta?.vehiculo;
                return {
                    financiacionId: c.financiacion?.id ?? null,
                    clienteId: c.financiacion?.clienteId ?? null,
                    cliente: c.financiacion?.cliente?.nombre ?? '',
                    telefono: c.financiacion?.cliente?.telefono ?? '',
                    vehiculo: veh ? `${veh.marca} ${veh.modelo}`.trim() : '',
                    dominio: veh?.dominio ?? '',
                    nroCuota: c.nroCuota,
                    vencimiento: c.vencimiento.toISOString().slice(0, 10),
                    diasAtraso,
                    moneda: c.financiacion?.moneda ?? 'ARS',
                    saldo: num(c.saldoCuota),
                };
            });

            const resumen = {
                cuotasVencidas: items.length,
                // Por clienteId, no por nombre: dos clientes homónimos son dos
                // deudores distintos y contarlos como uno subestima la cartera.
                clientes: new Set(items.map((i) => i.clienteId).filter((id) => id !== null)).size,
                porMoneda: agruparPorMoneda(items, ['saldo']),
            };

            if (req.query.format === 'csv') {
                return sendCsv(res, 'reporte-mora', [
                    { key: 'cliente', header: 'Cliente' },
                    { key: 'telefono', header: 'Teléfono' },
                    { key: 'vehiculo', header: 'Vehículo' },
                    { key: 'dominio', header: 'Dominio' },
                    { key: 'nroCuota', header: 'N° cuota' },
                    { key: 'vencimiento', header: 'Vencimiento' },
                    { key: 'diasAtraso', header: 'Días de atraso' },
                    // Sin esta columna, un saldo en ARS y uno en USD quedaban
                    // indistinguibles en la planilla (el JSON sí traía la moneda).
                    { key: 'moneda', header: 'Moneda' },
                    { key: 'saldo', header: 'Saldo adeudado' },
                ], items);
            }

            // Consolidación opcional a una sola moneda (?consolidar=ARS|USD).
            const consolidar = parseConsolidar(req.query);
            let consolidado: any = null;
            let sinCotizacion = false;
            if (consolidar) {
                const cot = await getCotizacionParaConsolidar();
                if (!cot) sinCotizacion = true;
                else consolidado = {
                    moneda: consolidar,
                    valor: cot.valor,
                    fechaCotizacion: cot.fecha,
                    cuotasVencidas: items.length,
                    ...consolidarBuckets(resumen.porMoneda, ['saldo'], consolidar, cot.valor),
                };
            }

            res.json({ resumen, items, consolidado, sinCotizacion });
        } catch (error) {
            next(error);
        }
    }

    // ── 4. Rentabilidad por vehículo vendido ─────────────────────────────────
    // GET /api/reportes/rentabilidad?desde=&hasta=&sucursalId=&format=csv
    // Rentabilidad = precio de venta − (precio de compra + gastos del vehículo)
    static async rentabilidad(req: Request, res: Response, next: NextFunction) {
        try {
            const { desde, hasta } = parseRango(req.query);
            const where: any = { ...filtroFecha('fechaVenta', desde, hasta) };
            const sucursalId = idOpcional(req.query.sucursalId, 'sucursalId');
            if (sucursalId) where.sucursalId = sucursalId;

            const ventas = await prisma.venta.findMany({
                where,
                orderBy: { fechaVenta: 'desc' },
                include: {
                    // `moneda` del vehículo es OBLIGATORIA acá: es independiente de
                    // la de la venta (se compra en USD y se vende en ARS todo el
                    // tiempo), así que sin ella no se sabe si el costo es restable.
                    vehiculo: { select: { id: true, marca: true, modelo: true, dominio: true, precioCompra: true, moneda: true } },
                    sucursal: { select: { nombre: true } },
                },
            });

            // Gastos por vehículo Y moneda, de una sola vez (evita N+1). Agrupar
            // sólo por vehiculoId sumaría pesos con dólares antes de llegar al
            // cálculo. Clave: `${vehiculoId}|${moneda}`.
            const vehiculoIds = ventas.map((v) => v.vehiculoId);
            const gastosPorVehiculo = new Map<string, number>();
            if (vehiculoIds.length > 0) {
                const grupos = await prisma.gastoVehiculo.groupBy({
                    by: ['vehiculoId', 'moneda'],
                    _sum: { monto: true },
                    where: { vehiculoId: { in: vehiculoIds } },
                });
                for (const g of grupos) {
                    gastosPorVehiculo.set(`${g.vehiculoId}|${g.moneda}`, num(g._sum.monto));
                }
            }

            /** Lo gastado en el vehículo en una moneda puntual. */
            const gastosEn = (vehiculoId: number, moneda: string) =>
                gastosPorVehiculo.get(`${vehiculoId}|${moneda}`) ?? 0;

            /** Lo gastado en el vehículo en CUALQUIER otra moneda. */
            const gastosEnOtras = (vehiculoId: number, monedaVenta: string) => {
                const otras: Record<string, number> = {};
                for (const [clave, monto] of gastosPorVehiculo) {
                    const [id, m] = clave.split('|');
                    if (Number(id) === vehiculoId && m !== monedaVenta) otras[m] = (otras[m] ?? 0) + monto;
                }
                return otras;
            };

            // Consolidación opcional (?consolidar=ARS|USD). Con una cotización, el
            // costo en otra moneda YA es restable: la rentabilidad que antes salía
            // en null (—) ahora se puede calcular convirtiendo todo a una moneda.
            const consolidar = parseConsolidar(req.query);
            const cot = consolidar ? await getCotizacionParaConsolidar() : null;
            const sinCotizacion = !!consolidar && !cot;

            const items = ventas.map((v) => {
                const moneda = v.moneda;
                const precioVenta = num(v.precioVenta);

                // Sólo se resta lo que está en la MISMA moneda que la venta. Un
                // auto comprado en USD y vendido en ARS no se puede costear sin
                // una cotización, y el sistema no guarda ninguna.
                const compraEsRestable = (v.vehiculo?.moneda ?? 'ARS') === moneda;
                const precioCompra = compraEsRestable ? num(v.vehiculo?.precioCompra) : 0;
                const gastos = gastosEn(v.vehiculoId, moneda);

                const otras = gastosEnOtras(v.vehiculoId, moneda);
                if (!compraEsRestable && v.vehiculo?.precioCompra) {
                    const m = v.vehiculo.moneda ?? 'ARS';
                    otras[m] = (otras[m] ?? 0) + num(v.vehiculo.precioCompra);
                }
                // Si quedó algo afuera, el margen sería mentira: se informa null y
                // se detalla qué no se pudo contar, en vez de imprimir un número
                // lindo y falso.
                const incompleto = Object.keys(otras).length > 0;

                const costo = precioCompra + gastos;
                const rentabilidad = incompleto ? null : precioVenta - costo;
                const margen = precioVenta > 0 && rentabilidad !== null
                    ? Math.round((rentabilidad / precioVenta) * 1000) / 10
                    : null;

                // Versión consolidada del item: convierte compra, gastos y venta a
                // la moneda destino. Acá SÍ se resta todo (no queda `sinContar`),
                // porque la cotización permite comparar peras con peras.
                let consolidadoItem: any = undefined;
                if (consolidar && cot) {
                    const pvConv = convertir(precioVenta, moneda, consolidar, cot.valor);
                    const compraConv = convertir(num(v.vehiculo?.precioCompra), String(v.vehiculo?.moneda ?? 'ARS'), consolidar, cot.valor);
                    let gastosConv = 0;
                    for (const [clave, monto] of gastosPorVehiculo) {
                        const [id, m] = clave.split('|');
                        if (Number(id) === v.vehiculoId) gastosConv += convertir(monto, m, consolidar, cot.valor);
                    }
                    const costoConv = compraConv + gastosConv;
                    const rentaConv = pvConv - costoConv;
                    consolidadoItem = {
                        moneda: consolidar,
                        precioVenta: pvConv,
                        precioCompra: compraConv,
                        gastos: gastosConv,
                        costo: costoConv,
                        rentabilidad: rentaConv,
                        margenPct: pvConv > 0 ? Math.round((rentaConv / pvConv) * 1000) / 10 : null,
                    };
                }

                return {
                    fecha: v.fechaVenta.toISOString().slice(0, 10),
                    vehiculo: `${v.vehiculo?.marca ?? ''} ${v.vehiculo?.modelo ?? ''}`.trim(),
                    dominio: v.vehiculo?.dominio ?? '',
                    sucursal: v.sucursal?.nombre ?? '',
                    moneda,
                    precioVenta,
                    precioCompra,
                    gastos,
                    costo,
                    rentabilidad,
                    margenPct: margen,
                    incompleto,
                    /** Importes en otra moneda que no se pudieron restar. */
                    sinContar: incompleto ? otras : undefined,
                    /** Mismos números convertidos a la moneda de consolidación (si se pidió). */
                    consolidado: consolidadoItem,
                };
            });

            const resumen = {
                cantidad: items.length,
                porMoneda: agruparPorMoneda(items, ['precioVenta', 'costo', 'rentabilidad']),
            };

            if (req.query.format === 'csv') {
                return sendCsv(res, 'reporte-rentabilidad', [
                    { key: 'fecha', header: 'Fecha' },
                    { key: 'vehiculo', header: 'Vehículo' },
                    { key: 'dominio', header: 'Dominio' },
                    { key: 'sucursal', header: 'Sucursal' },
                    { key: 'moneda', header: 'Moneda' },
                    { key: 'precioVenta', header: 'Precio venta' },
                    { key: 'precioCompra', header: 'Precio compra' },
                    { key: 'gastos', header: 'Gastos' },
                    { key: 'rentabilidad', header: 'Rentabilidad' },
                    { key: 'margenPct', header: 'Margen %' },
                ], items);
            }

            // Total consolidado: suma de los items ya convertidos a la moneda destino.
            let consolidado: any = null;
            if (consolidar && cot) {
                const acc = { precioVenta: 0, costo: 0, rentabilidad: 0 };
                for (const it of items) {
                    if (!it.consolidado) continue;
                    acc.precioVenta += it.consolidado.precioVenta;
                    acc.costo += it.consolidado.costo;
                    acc.rentabilidad += it.consolidado.rentabilidad;
                }
                consolidado = {
                    moneda: consolidar,
                    valor: cot.valor,
                    fechaCotizacion: cot.fecha,
                    cantidad: items.length,
                    ...acc,
                };
            }

            res.json({ resumen, items, consolidado, sinCotizacion });
        } catch (error) {
            next(error);
        }
    }

    // ── 5. Próximos vencimientos (cuotas por vencer) ─────────────────────────
    // GET /api/reportes/proximos-vencimientos?dias=&consolidar=&format=csv
    // El espejo PROACTIVO de la mora: en vez de lo ya vencido, las cuotas que
    // vencen en los próximos N días para llamar al cliente antes de que caiga.
    static async proximosVencimientos(req: Request, res: Response, next: NextFunction) {
        try {
            // Ventana: de HOY (inclusive) a hoy + dias. Default 7, tope 90.
            const dias = enteroEnRango(req.query.dias, 1, 90, 7, 'dias');
            // `vencimiento` es @db.Date (medianoche UTC). Se compara contra fechas
            // puras en UTC, igual criterio que el reporte de mora.
            const ahora = new Date();
            const inicioHoy = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));
            // Ventana de EXACTAMENTE `dias` días calendario: [hoy, hoy+dias). El
            // límite superior es exclusivo (lt) a propósito; con `lte` la ventana
            // abarcaba dias+1 días (8 para "próximos 7 días"). Así diasParaVencer
            // va de 0 (hoy) a dias-1.
            const finVentana = new Date(inicioHoy);
            finVentana.setUTCDate(finVentana.getUTCDate() + dias);

            const cuotas = await prisma.cuota.findMany({
                where: {
                    vencimiento: { gte: inicioHoy, lt: finVentana },
                    saldoCuota: { gt: 0 },
                    // Ni las pagadas ni las refinanciadas son deuda por cobrar: la
                    // refinanciada movió su saldo a otro contrato (ver enum EstadoCuota).
                    estado: { notIn: ['pagada', 'refinanciada'] },
                    // Igual que en mora: una financiación borrada no tiene deuda viva.
                    financiacion: { deletedAt: null },
                },
                orderBy: { vencimiento: 'asc' },
                include: {
                    financiacion: {
                        select: {
                            id: true,
                            moneda: true,
                            clienteId: true,
                            cliente: { select: { nombre: true, telefono: true } },
                            venta: { select: { vehiculo: { select: { marca: true, modelo: true, dominio: true } } } },
                        },
                    },
                },
            });

            const items = cuotas.map((c) => {
                // Días completos desde hoy hasta el vencimiento (0 = vence hoy).
                const diasParaVencer = Math.max(0, Math.round((c.vencimiento.getTime() - inicioHoy.getTime()) / 86400000));
                const veh = c.financiacion?.venta?.vehiculo;
                return {
                    financiacionId: c.financiacion?.id ?? null,
                    clienteId: c.financiacion?.clienteId ?? null,
                    cliente: c.financiacion?.cliente?.nombre ?? '',
                    telefono: c.financiacion?.cliente?.telefono ?? '',
                    vehiculo: veh ? `${veh.marca} ${veh.modelo}`.trim() : '',
                    dominio: veh?.dominio ?? '',
                    nroCuota: c.nroCuota,
                    vencimiento: c.vencimiento.toISOString().slice(0, 10),
                    diasParaVencer,
                    moneda: c.financiacion?.moneda ?? 'ARS',
                    saldo: num(c.saldoCuota),
                };
            });

            const resumen = {
                cuotasPorVencer: items.length,
                clientes: new Set(items.map((i) => i.clienteId).filter((id) => id !== null)).size,
                porMoneda: agruparPorMoneda(items, ['saldo']),
            };

            if (req.query.format === 'csv') {
                return sendCsv(res, `reporte-proximos-vencimientos-${dias}d`, [
                    { key: 'cliente', header: 'Cliente' },
                    { key: 'telefono', header: 'Teléfono' },
                    { key: 'vehiculo', header: 'Vehículo' },
                    { key: 'dominio', header: 'Dominio' },
                    { key: 'nroCuota', header: 'N° cuota' },
                    { key: 'vencimiento', header: 'Vencimiento' },
                    { key: 'diasParaVencer', header: 'Días para vencer' },
                    { key: 'moneda', header: 'Moneda' },
                    { key: 'saldo', header: 'Saldo a cobrar' },
                ], items);
            }

            // Consolidación opcional a una sola moneda (?consolidar=ARS|USD).
            const consolidar = parseConsolidar(req.query);
            let consolidado: any = null;
            let sinCotizacion = false;
            if (consolidar) {
                const cot = await getCotizacionParaConsolidar();
                if (!cot) sinCotizacion = true;
                else consolidado = {
                    moneda: consolidar,
                    valor: cot.valor,
                    fechaCotizacion: cot.fecha,
                    cuotasPorVencer: items.length,
                    ...consolidarBuckets(resumen.porMoneda, ['saldo'], consolidar, cot.valor),
                };
            }

            // finVentana es exclusivo: el último día incluido es el anterior.
            const ultimoDia = new Date(finVentana);
            ultimoDia.setUTCDate(ultimoDia.getUTCDate() - 1);

            res.json({
                ventana: {
                    dias,
                    desde: inicioHoy.toISOString().slice(0, 10),
                    hasta: ultimoDia.toISOString().slice(0, 10),
                },
                resumen,
                items,
                consolidado,
                sinCotizacion,
            });
        } catch (error) {
            next(error);
        }
    }

    // ── 6. Antigüedad de stock (agregado para el centro de alertas) ──────────
    // GET /api/reportes/stock-antiguedad?umbral=&consolidar=
    // Distribución de las unidades EN stock por antigüedad + cuántas y cuánto
    // capital (precio de compra) están "estancadas" (más de `umbral` días).
    static async stockAntiguedad(req: Request, res: Response, next: NextFunction) {
        try {
            const umbral = enteroEnRango(req.query.umbral, 1, 3650, 60, 'umbral');
            const ahora = new Date();
            const inicioHoy = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));

            // Sólo lo que sigue en el parque: vendido/devuelto ya no envejece.
            const vehiculos = await prisma.vehiculo.findMany({
                where: { estado: { in: ['preparacion', 'publicado', 'reservado'] } },
                select: { fechaIngreso: true, precioCompra: true, moneda: true },
            });

            // Días en stock, en UTC puro (fechaIngreso es @db.Date).
            const diasDe = (f: Date) =>
                Math.max(0, Math.round((inicioHoy.getTime() - Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate())) / 86400000));

            const buckets = [
                { key: '0-30', label: '0 a 30 días', count: 0 },
                { key: '31-60', label: '31 a 60 días', count: 0 },
                { key: '61-90', label: '61 a 90 días', count: 0 },
                { key: '90+', label: 'Más de 90 días', count: 0 },
            ];
            // Capital inmovilizado de las estancadas, por moneda (precio de compra).
            // El campo se llama `capital` (no `valor`) a propósito: `valor` es la
            // cotización usada en el consolidado, y colisionarían en el spread.
            const estancadosItems: { moneda: string; capital: number }[] = [];
            let antiguedadMax = 0;

            for (const v of vehiculos) {
                const d = diasDe(v.fechaIngreso);
                antiguedadMax = Math.max(antiguedadMax, d);
                if (d <= 30) buckets[0].count++;
                else if (d <= 60) buckets[1].count++;
                else if (d <= 90) buckets[2].count++;
                else buckets[3].count++;
                if (d > umbral) estancadosItems.push({ moneda: v.moneda ?? 'ARS', capital: num(v.precioCompra) });
            }

            const porMoneda = agruparPorMoneda(estancadosItems, ['capital']);
            const estancados = { umbral, count: estancadosItems.length, porMoneda };

            // Consolidación opcional del capital inmovilizado (?consolidar=ARS|USD).
            const consolidar = parseConsolidar(req.query);
            let consolidado: any = null;
            let sinCotizacion = false;
            if (consolidar) {
                const cot = await getCotizacionParaConsolidar();
                if (!cot) sinCotizacion = true;
                else consolidado = {
                    moneda: consolidar,
                    valor: cot.valor,
                    fechaCotizacion: cot.fecha,
                    count: estancadosItems.length,
                    ...consolidarBuckets(porMoneda, ['capital'], consolidar, cot.valor),
                };
            }

            res.json({ total: vehiculos.length, antiguedadMax, buckets, estancados, consolidado, sinCotizacion });
        } catch (error) {
            next(error);
        }
    }

    // ── 7. Ranking de vendedores ─────────────────────────────────────────────
    // GET /api/reportes/ranking-vendedores?desde=&hasta=&sucursalId=&consolidar=&format=csv
    // Performance del equipo comercial en el período: unidades, facturado y
    // rentabilidad por vendedor. Reutiliza la lógica de ventas + rentabilidad.
    static async rankingVendedores(req: Request, res: Response, next: NextFunction) {
        try {
            const { desde, hasta } = parseRango(req.query);
            const where: any = { ...filtroFecha('fechaVenta', desde, hasta) };
            const sucursalId = idOpcional(req.query.sucursalId, 'sucursalId');
            if (sucursalId) where.sucursalId = sucursalId;

            const ventas = await prisma.venta.findMany({
                where,
                include: {
                    vendedor: { select: { id: true, nombre: true } },
                    vehiculo: { select: { id: true, precioCompra: true, moneda: true } },
                    // Los extras anulados no suman al facturado (el filtro de borrados
                    // de la extensión no alcanza a los include).
                    extras: { where: { deletedAt: null }, select: { monto: true } },
                },
            });

            // Gastos por vehículo Y moneda de una sola vez (evita N+1), igual que
            // el reporte de rentabilidad.
            const vehiculoIds = ventas.map((v) => v.vehiculoId);
            const gastosPorVehiculo = new Map<string, number>();
            if (vehiculoIds.length > 0) {
                const grupos = await prisma.gastoVehiculo.groupBy({
                    by: ['vehiculoId', 'moneda'],
                    _sum: { monto: true },
                    where: { vehiculoId: { in: vehiculoIds } },
                });
                for (const g of grupos) gastosPorVehiculo.set(`${g.vehiculoId}|${g.moneda}`, num(g._sum.monto));
            }
            const gastosEn = (vid: number, m: string) => gastosPorVehiculo.get(`${vid}|${m}`) ?? 0;

            const consolidar = parseConsolidar(req.query);
            const cot = consolidar ? await getCotizacionParaConsolidar() : null;
            const sinCotizacion = !!consolidar && !cot;

            // vendedorId -> acumulado
            const map = new Map<number, any>();
            const bucket = (id: number, nombre: string) => {
                if (!map.has(id)) {
                    map.set(id, { vendedorId: id, vendedor: nombre, unidades: 0, _porMoneda: new Map<string, any>(), _consFacturado: 0, _consRenta: 0 });
                }
                return map.get(id);
            };

            for (const v of ventas) {
                const vendId = v.vendedorId ?? v.vendedor?.id ?? 0;
                const acc = bucket(vendId, v.vendedor?.nombre ?? 'Sin asignar');
                acc.unidades += 1;

                const moneda = v.moneda;
                const precioVenta = num(v.precioVenta);
                const extras = v.extras.reduce((s, e) => s + num(e.monto), 0);
                const facturado = precioVenta + extras;

                // Rentabilidad SÓLO cuando el costo es de la misma moneda que la
                // venta (mismo criterio que el reporte de rentabilidad): si hay
                // costos en otra moneda, sin cotización el margen no es calculable.
                const compraEsRestable = (v.vehiculo?.moneda ?? 'ARS') === moneda;
                const precioCompra = compraEsRestable ? num(v.vehiculo?.precioCompra) : 0;
                const gastos = gastosEn(v.vehiculoId, moneda);
                let incompleto = !compraEsRestable && !!v.vehiculo?.precioCompra;
                if (!incompleto) {
                    for (const [clave] of gastosPorVehiculo) {
                        const [id, m] = clave.split('|');
                        if (Number(id) === v.vehiculoId && m !== moneda) { incompleto = true; break; }
                    }
                }
                const rentabilidad = incompleto ? null : precioVenta - (precioCompra + gastos);

                const pm = acc._porMoneda;
                if (!pm.has(moneda)) pm.set(moneda, { moneda, facturado: 0, rentabilidad: 0 });
                const pmb = pm.get(moneda);
                pmb.facturado += facturado;
                pmb.rentabilidad += num(rentabilidad); // null → 0, como agruparPorMoneda

                if (consolidar && cot) {
                    const facturadoConv = convertir(facturado, moneda, consolidar, cot.valor);
                    const pvConv = convertir(precioVenta, moneda, consolidar, cot.valor);
                    const compraConv = convertir(num(v.vehiculo?.precioCompra), String(v.vehiculo?.moneda ?? 'ARS'), consolidar, cot.valor);
                    let gastosConv = 0;
                    for (const [clave, monto] of gastosPorVehiculo) {
                        const [id, m] = clave.split('|');
                        if (Number(id) === v.vehiculoId) gastosConv += convertir(monto, m, consolidar, cot.valor);
                    }
                    acc._consFacturado += facturadoConv;
                    acc._consRenta += pvConv - (compraConv + gastosConv);
                }
            }

            const items = Array.from(map.values()).map((a) => ({
                vendedorId: a.vendedorId,
                vendedor: a.vendedor,
                unidades: a.unidades,
                porMoneda: Array.from(a._porMoneda.values()).sort((x: any, y: any) => String(x.moneda).localeCompare(y.moneda)),
                consolidado: (consolidar && cot) ? { moneda: consolidar, facturado: a._consFacturado, rentabilidad: a._consRenta } : null,
            }));

            // Ranking: por facturado consolidado si se pidió; si no, por unidades
            // (currency-agnostic, siempre comparable).
            items.sort((a, b) => {
                if (a.consolidado && b.consolidado) return b.consolidado.facturado - a.consolidado.facturado;
                return b.unidades - a.unidades;
            });

            const resumen = {
                vendedores: items.length,
                unidades: items.reduce((s, i) => s + i.unidades, 0),
            };

            if (req.query.format === 'csv') {
                // Una fila por vendedor y moneda (el CSV no consolida).
                const filas = items.flatMap((i) => i.porMoneda.map((pm: any) => ({
                    vendedor: i.vendedor,
                    unidades: i.unidades,
                    moneda: pm.moneda,
                    facturado: pm.facturado,
                    rentabilidad: pm.rentabilidad,
                })));
                return sendCsv(res, 'reporte-ranking-vendedores', [
                    { key: 'vendedor', header: 'Vendedor' },
                    { key: 'unidades', header: 'Unidades' },
                    { key: 'moneda', header: 'Moneda' },
                    { key: 'facturado', header: 'Facturado' },
                    { key: 'rentabilidad', header: 'Rentabilidad' },
                ], filas);
            }

            let consolidado: any = null;
            if (consolidar && cot) {
                consolidado = {
                    moneda: consolidar,
                    valor: cot.valor,
                    fechaCotizacion: cot.fecha,
                    facturado: items.reduce((s, i) => s + (i.consolidado?.facturado ?? 0), 0),
                    rentabilidad: items.reduce((s, i) => s + (i.consolidado?.rentabilidad ?? 0), 0),
                };
            }

            res.json({
                periodo: {
                    desde: desde ? desde.toISOString().slice(0, 10) : null,
                    hasta: hasta ? hasta.toISOString().slice(0, 10) : null,
                },
                items,
                resumen,
                consolidado,
                sinCotizacion,
            });
        } catch (error) {
            next(error);
        }
    }

    // ── 8. Estado de cuenta de un cliente ────────────────────────────────────
    // GET /api/reportes/estado-cuenta?clienteId=
    // Foto de la deuda del cliente: por cada financiación, progreso de pago y
    // saldo; y los totales (saldo pendiente, cuotas vencidas, próximo vencimiento).
    static async estadoCuenta(req: Request, res: Response, next: NextFunction) {
        try {
            const clienteId = idOpcional(req.query.clienteId, 'clienteId');
            if (!clienteId) {
                throw new BaseException(400, 'clienteId es obligatorio', 'VALIDATION_ERROR');
            }

            // Hoy a medianoche UTC (mismo criterio de vencido que el reporte de mora).
            const ahora = new Date();
            const inicioHoy = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));

            const financiaciones = await prisma.financiacion.findMany({
                where: { clienteId },
                orderBy: { fechaInicio: 'desc' },
                include: {
                    // El filtro de borrados de la extensión no alcanza al include.
                    cuotasPlan: { where: { deletedAt: null } },
                    venta: { select: { vehiculo: { select: { marca: true, modelo: true, dominio: true } } } },
                },
            });

            const items = financiaciones.map((f) => {
                const cuotas = f.cuotasPlan;
                // Cuotas "vivas": ni pagadas ni refinanciadas (su saldo se movió a otro contrato).
                const vivas = cuotas.filter((c) => c.estado !== 'pagada' && c.estado !== 'refinanciada' && num(c.saldoCuota) > 0);
                const saldoPendiente = vivas.reduce((s, c) => s + num(c.saldoCuota), 0);
                const vencidas = vivas.filter((c) => c.vencimiento < inicioHoy);
                const saldoVencido = vencidas.reduce((s, c) => s + num(c.saldoCuota), 0);
                const futuras = vivas
                    .filter((c) => c.vencimiento >= inicioHoy)
                    .sort((a, b) => a.vencimiento.getTime() - b.vencimiento.getTime());
                const proxima = futuras[0]
                    ? { nroCuota: futuras[0].nroCuota, vencimiento: futuras[0].vencimiento.toISOString().slice(0, 10), monto: num(futuras[0].saldoCuota) }
                    : null;
                const veh = f.venta?.vehiculo;
                return {
                    id: f.id,
                    fechaInicio: f.fechaInicio.toISOString().slice(0, 10),
                    moneda: f.moneda,
                    montoFinanciado: num(f.montoFinanciado),
                    estado: f.estado,
                    vehiculo: veh ? `${veh.marca} ${veh.modelo}`.trim() : '',
                    dominio: veh?.dominio ?? '',
                    cuotasTotal: cuotas.length,
                    cuotasPagadas: cuotas.filter((c) => c.estado === 'pagada').length,
                    saldoPendiente,
                    cuotasVencidas: vencidas.length,
                    saldoVencido,
                    proximaCuota: proxima,
                };
            });

            const porMoneda = agruparPorMoneda(
                items.map((i) => ({ moneda: i.moneda, montoFinanciado: i.montoFinanciado, saldoPendiente: i.saldoPendiente, saldoVencido: i.saldoVencido })),
                ['montoFinanciado', 'saldoPendiente', 'saldoVencido'],
            );

            // La próxima cuota a nivel cliente: la más cercana entre todas las financiaciones.
            const proximas = items
                .filter((i) => i.proximaCuota)
                .map((i) => ({ ...i.proximaCuota!, financiacionId: i.id, moneda: i.moneda }))
                .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));

            res.json({
                clienteId,
                financiaciones: items,
                resumen: {
                    financiaciones: items.length,
                    activas: items.filter((i) => i.estado === 'activa').length,
                    cuotasVencidas: items.reduce((s, i) => s + i.cuotasVencidas, 0),
                    porMoneda,
                    proximaCuota: proximas[0] ?? null,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    // ── 9. Tendencia de ventas (últimos N meses) ─────────────────────────────
    // GET /api/reportes/ventas-mensuales?meses=6&consolidar=
    // Serie mensual de unidades vendidas y facturado, para el gráfico de
    // tendencia del Dashboard. Incluye los meses sin ventas (en 0).
    static async ventasMensuales(req: Request, res: Response, next: NextFunction) {
        try {
            const meses = enteroEnRango(req.query.meses, 1, 24, 6, 'meses');
            const ahora = new Date();
            // Primer día del mes más viejo de la ventana. fechaVenta es @db.Date:
            // se compara en UTC puro (igual criterio que el resto de reportes).
            const desdeFecha = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth() - (meses - 1), 1));

            const ventas = await prisma.venta.findMany({
                where: { fechaVenta: { gte: desdeFecha } },
                select: {
                    fechaVenta: true,
                    precioVenta: true,
                    moneda: true,
                    extras: { where: { deletedAt: null }, select: { monto: true } },
                },
            });

            const consolidar = parseConsolidar(req.query);
            const cot = consolidar ? await getCotizacionParaConsolidar() : null;
            const sinCotizacion = !!consolidar && !cot;

            const MESES_LBL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

            // Pre-crea los N meses (así aparecen aunque no tengan ventas).
            const buckets = new Map<string, any>();
            for (let i = 0; i < meses; i++) {
                const d = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth() - (meses - 1) + i, 1));
                const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
                buckets.set(key, {
                    anio: d.getUTCFullYear(),
                    mes: d.getUTCMonth() + 1,
                    label: `${MESES_LBL[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
                    cantidad: 0,
                    _pm: new Map<string, number>(),
                    _cons: 0,
                });
            }

            for (const v of ventas) {
                const f = v.fechaVenta;
                const key = `${f.getUTCFullYear()}-${f.getUTCMonth()}`;
                const b = buckets.get(key);
                if (!b) continue; // fuera de la ventana (borde)
                b.cantidad += 1;
                const extras = v.extras.reduce((s, e) => s + num(e.monto), 0);
                const facturado = num(v.precioVenta) + extras;
                b._pm.set(v.moneda, (b._pm.get(v.moneda) ?? 0) + facturado);
                if (cot) b._cons += convertir(facturado, v.moneda, consolidar as any, cot.valor);
            }

            const items = Array.from(buckets.values()).map((b) => ({
                anio: b.anio,
                mes: b.mes,
                label: b.label,
                cantidad: b.cantidad,
                porMoneda: Array.from((b._pm as Map<string, number>).entries())
                    .map(([moneda, facturado]) => ({ moneda, facturado }))
                    .sort((x, y) => String(x.moneda).localeCompare(String(y.moneda))),
                facturadoConsolidado: cot ? b._cons : null,
            }));

            res.json({
                meses,
                moneda: consolidar || null,
                valorCotizacion: cot?.valor ?? null,
                fechaCotizacion: cot?.fecha ?? null,
                items,
                sinCotizacion,
            });
        } catch (error) {
            next(error);
        }
    }
}
