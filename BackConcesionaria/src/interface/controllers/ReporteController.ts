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

            res.json({ resumen, items });
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

            res.json(resultado);
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

            res.json({ resumen, items });
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

            res.json({ resumen, items });
        } catch (error) {
            next(error);
        }
    }
}
