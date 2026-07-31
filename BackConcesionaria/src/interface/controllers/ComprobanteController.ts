import { Request, Response, NextFunction } from 'express';
import PDFDocument from 'pdfkit';
import prisma from '../../infrastructure/database/prisma';
import { NotFoundException } from '../../domain/exceptions/BaseException';
import { resolveBranding, drawEncabezado, drawPie } from './pdf/branding';
import { renderEstadoCuenta, EstadoCuentaData, FinanciacionLinea } from './pdf/estadoCuenta';

// Campos de marca que cada PDF necesita de su concesionaria (logo/colores/pie).
const marcaSelect = {
    nombre: true, cuit: true, email: true, telefono: true,
    logoStorageKey: true, colorPrimario: true, colorSecundario: true, pdfPie: true, sitioWeb: true,
} as const;

const money = (n: unknown, moneda = 'ARS') => {
    const simbolo = moneda === 'USD' ? 'US$' : '$';
    return `${simbolo}${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fecha = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('es-AR') : '—';

export class ComprobanteController {
    // GET /api/ventas/:id/comprobante  → PDF descargable del comprobante de venta.
    static async ventaPdf(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.id);
            // El extension de Prisma no propaga el tipo de los `include`; se castea
            // a any como en el resto de los repos del proyecto.
            const venta = await prisma.venta.findFirst({
                where: { id },
                include: {
                    cliente: true,
                    vehiculo: true,
                    vendedor: { select: { nombre: true, email: true } },
                    sucursal: true,
                    concesionaria: { select: marcaSelect },
                    pagos: true,
                    extras: true,
                    canjes: { include: { vehiculo: { select: { marca: true, modelo: true, dominio: true } } } },
                },
            }) as any;

            if (!venta) throw new NotFoundException('Venta');

            const moneda = venta.moneda || 'ARS';
            const totalPagos = venta.pagos.reduce((s: number, p: any) => s + Number(p.monto), 0);
            const totalExtras = venta.extras.reduce((s: number, e: any) => s + Number(e.monto), 0);
            const totalVenta = Number(venta.precioVenta) + totalExtras;
            const saldo = totalVenta - totalPagos;

            // Cabeceras de descarga. Se genera en memoria y se hace pipe a la respuesta.
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="comprobante-venta-${venta.id}.pdf"`);

            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            doc.pipe(res);

            // ── Marca (logo/colores del tenant, o AUTENZA por defecto) ────────────
            const brand = await resolveBranding(venta.concesionaria);
            const accent = brand.accent;
            const muted = brand.muted;

            // ── Encabezado ────────────────────────────────────────────────────────
            const infoLineas = [
                venta.concesionaria?.cuit ? `CUIT: ${venta.concesionaria.cuit}` : '',
                venta.sucursal?.nombre ? `Sucursal: ${venta.sucursal.nombre}` : '',
                venta.sucursal?.direccion || '',
            ].filter(Boolean);
            drawEncabezado(doc, brand, infoLineas);

            doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
                .text('COMPROBANTE DE VENTA', 50, 50, { align: 'right' });
            doc.fillColor(muted).fontSize(10).font('Helvetica')
                .text(`N° ${String(venta.id).padStart(6, '0')}`, { align: 'right' })
                .text(`Fecha: ${fecha(venta.fechaVenta)}`, { align: 'right' });

            doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').stroke();

            // ── Cliente y vehículo ────────────────────────────────────────────────
            let y = 150;
            const bloque = (titulo: string, lineas: string[], x: number) => {
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text(titulo.toUpperCase(), x, y);
                doc.fillColor('#111827').fontSize(10).font('Helvetica');
                lineas.forEach((l, i) => doc.text(l, x, y + 15 + i * 14, { width: 230 }));
            };

            bloque('Cliente', [
                venta.cliente?.nombre || '—',
                venta.cliente?.dni ? `DNI/CUIT: ${venta.cliente.dni}` : '',
                venta.cliente?.telefono ? `Tel: ${venta.cliente.telefono}` : '',
                venta.cliente?.email || '',
            ].filter(Boolean), 50);

            bloque('Vehículo', [
                `${venta.vehiculo?.marca || ''} ${venta.vehiculo?.modelo || ''}`.trim(),
                venta.vehiculo?.version || '',
                venta.vehiculo?.dominio ? `Dominio: ${venta.vehiculo.dominio}` : '',
                venta.vehiculo?.anio ? `Año: ${venta.vehiculo.anio}` : '',
            ].filter(Boolean), 310);

            y += 90;

            // ── Detalle de importes ───────────────────────────────────────────────
            const fila = (label: string, valor: string, negrita = false) => {
                doc.fillColor('#111827').fontSize(10).font(negrita ? 'Helvetica-Bold' : 'Helvetica');
                doc.text(label, 50, y, { width: 380 });
                doc.text(valor, 430, y, { width: 115, align: 'right' });
                y += 18;
            };

            doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('DETALLE', 50, y);
            y += 16;
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 8;

            fila(`Vehículo (${venta.formaPago})`, money(venta.precioVenta, moneda));
            for (const e of venta.extras) fila(`Extra: ${e.descripcion}`, money(e.monto, moneda));
            for (const c of venta.canjes) {
                const v = c.vehiculo;
                fila(`Canje: ${v?.marca || ''} ${v?.modelo || ''} ${v?.dominio ? `(${v.dominio})` : ''}`.trim(), `- ${money(c.valorTomado, moneda)}`);
            }

            y += 4;
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 8;
            fila('TOTAL', money(totalVenta, moneda), true);
            fila('Pagado', money(totalPagos, moneda));
            fila('Saldo pendiente', money(saldo, moneda), true);

            // ── Pagos ─────────────────────────────────────────────────────────────
            if (venta.pagos.length > 0) {
                y += 14;
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('PAGOS REGISTRADOS', 50, y);
                y += 16;
                for (const p of venta.pagos) {
                    doc.fillColor('#111827').fontSize(9).font('Helvetica');
                    doc.text(`${fecha(p.fecha)} — ${p.metodo}${p.referencia ? ` (${p.referencia})` : ''}`, 50, y, { width: 380 });
                    doc.text(money(p.monto, moneda), 430, y, { width: 115, align: 'right' });
                    y += 15;
                }
            }

            // ── Pie (marca del tenant, o AUTENZA por defecto) ─────────────────────
            drawPie(doc, brand);
            doc.fillColor(muted).fontSize(8).font('Helvetica')
                .text(
                    `Vendedor: ${venta.vendedor?.nombre || '—'}   ·   Generado el ${new Date().toLocaleString('es-AR')}`,
                    50, 760, { align: 'center', width: 495 }
                );
            doc.text('Documento no válido como factura. Comprobante interno de operación.', 50, 772, { align: 'center', width: 495 });

            doc.end();
        } catch (error) {
            next(error);
        }
    }

    // GET /api/financiaciones/cuotas/:cuotaId/recibo → PDF del recibo de pago de una cuota.
    static async cuotaReciboPdf(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.cuotaId);
            const cuota = await prisma.cuota.findFirst({
                where: { id },
                include: {
                    pagos: { where: { deletedAt: null }, orderBy: { fechaPago: 'asc' } },
                    financiacion: {
                        include: {
                            cliente: true,
                            concesionaria: { select: marcaSelect },
                            sucursal: { select: { nombre: true, direccion: true } },
                            cobrador: { select: { nombre: true } },
                            venta: { include: { vehiculo: { select: { marca: true, modelo: true, dominio: true } } } },
                        },
                    },
                },
            }) as any;

            if (!cuota) throw new NotFoundException('Cuota');

            const fin = cuota.financiacion;
            const moneda = fin?.moneda || 'ARS';
            const cli = fin?.cliente;
            const veh = fin?.venta?.vehiculo;
            const totalPagado = cuota.pagos.reduce((s: number, p: any) => s + Number(p.monto), 0);
            const montoCuota = Number(cuota.montoCuota);
            const saldo = Number(cuota.saldoCuota);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="recibo-cuota-${cuota.id}.pdf"`);

            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            doc.pipe(res);

            // ── Marca (logo/colores del tenant, o AUTENZA por defecto) ────────────
            const brand = await resolveBranding(fin?.concesionaria);
            const accent = brand.accent;
            const muted = brand.muted;

            // ── Encabezado ────────────────────────────────────────────────────────
            const infoLineas = [
                fin?.concesionaria?.cuit ? `CUIT: ${fin.concesionaria.cuit}` : '',
                fin?.sucursal?.nombre ? `Sucursal: ${fin.sucursal.nombre}` : '',
                fin?.sucursal?.direccion || '',
            ].filter(Boolean);
            drawEncabezado(doc, brand, infoLineas);

            doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
                .text('RECIBO DE PAGO', 50, 50, { align: 'right' });
            doc.fillColor(muted).fontSize(10).font('Helvetica')
                .text(`Cuota N° ${String(cuota.id).padStart(6, '0')}`, { align: 'right' })
                .text(`Emitido: ${fecha(new Date())}`, { align: 'right' });

            doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').stroke();

            // ── Cliente y financiación ────────────────────────────────────────────
            let y = 150;
            const bloque = (titulo: string, lineas: string[], x: number) => {
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text(titulo.toUpperCase(), x, y);
                doc.fillColor('#111827').fontSize(10).font('Helvetica');
                lineas.forEach((l, i) => doc.text(l, x, y + 15 + i * 14, { width: 230 }));
            };

            bloque('Cliente', [
                cli?.nombre || '—',
                cli?.dni ? `DNI/CUIT: ${cli.dni}` : '',
                cli?.telefono ? `Tel: ${cli.telefono}` : '',
            ].filter(Boolean), 50);

            bloque('Vehículo / Financiación', [
                `${veh?.marca || ''} ${veh?.modelo || ''}`.trim() || '—',
                veh?.dominio ? `Dominio: ${veh.dominio}` : '',
                `Financiación N° ${fin?.id ?? '—'}`,
                `Cuota ${cuota.nroCuota} de ${fin?.cuotas ?? '—'}`,
            ].filter(Boolean), 310);

            y += 90;

            // ── Detalle de la cuota ───────────────────────────────────────────────
            const fila = (label: string, valor: string, negrita = false) => {
                doc.fillColor('#111827').fontSize(10).font(negrita ? 'Helvetica-Bold' : 'Helvetica');
                doc.text(label, 50, y, { width: 380 });
                doc.text(valor, 430, y, { width: 115, align: 'right' });
                y += 18;
            };

            doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('DETALLE DE LA CUOTA', 50, y);
            y += 16;
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 8;

            fila('Vencimiento', fecha(cuota.vencimiento));
            fila('Monto de la cuota', money(montoCuota, moneda), true);
            fila('Total pagado', money(totalPagado, moneda));
            fila('Saldo de la cuota', money(saldo, moneda), true);

            // ── Pagos registrados ─────────────────────────────────────────────────
            if (cuota.pagos.length > 0) {
                y += 14;
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('PAGOS REGISTRADOS', 50, y);
                y += 16;
                for (const p of cuota.pagos) {
                    doc.fillColor('#111827').fontSize(9).font('Helvetica');
                    doc.text(`${fecha(p.fechaPago)} — ${p.metodo}${p.referencia ? ` (${p.referencia})` : ''}`, 50, y, { width: 380 });
                    doc.text(money(p.monto, moneda), 430, y, { width: 115, align: 'right' });
                    y += 15;
                }
            }

            // ── Pie (marca del tenant, o AUTENZA por defecto) ─────────────────────
            drawPie(doc, brand);
            doc.fillColor(muted).fontSize(8).font('Helvetica')
                .text(
                    `Cobrador: ${fin?.cobrador?.nombre || '—'}   ·   Generado el ${new Date().toLocaleString('es-AR')}`,
                    50, 760, { align: 'center', width: 495 }
                );
            doc.text('Documento no válido como factura. Comprobante interno de pago.', 50, 772, { align: 'center', width: 495 });

            doc.end();
        } catch (error) {
            next(error);
        }
    }

    // GET /api/presupuestos/:id/pdf → PDF del presupuesto para enviar al cliente.
    static async presupuestoPdf(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.id);
            const p = await prisma.presupuesto.findFirst({
                where: { id },
                include: {
                    cliente: true,
                    vendedor: { select: { nombre: true, email: true } },
                    sucursal: true,
                    concesionaria: { select: marcaSelect },
                    // Mismos filtros de borrados que PrismaPresupuestoRepository: sin
                    // ellos, un extra anulado inflaría el total del PDF.
                    items: { where: { deletedAt: null }, include: { vehiculo: true } },
                    extras: { where: { deletedAt: null } },
                    canje: { where: { deletedAt: null } },
                },
            }) as any;

            if (!p) throw new NotFoundException('Presupuesto');

            const moneda = p.moneda || 'ARS';
            const subtotalItems = p.items.reduce((s: number, i: any) => s + Number(i.precioFinal), 0);
            const totalExtras = p.extras.reduce((s: number, e: any) => s + Number(e.monto), 0);
            const valorCanje = p.canje ? Number(p.canje.valorTomado) : 0;
            const total = subtotalItems + totalExtras - valorCanje;

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="presupuesto-${p.nroPresupuesto || p.id}.pdf"`);

            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            doc.pipe(res);

            // ── Marca (logo/colores del tenant, o AUTENZA por defecto) ────────────
            const brand = await resolveBranding(p.concesionaria);
            const accent = brand.accent;
            const muted = brand.muted;

            // ── Encabezado ────────────────────────────────────────────────────────
            const infoLineas = [
                p.concesionaria?.cuit ? `CUIT: ${p.concesionaria.cuit}` : '',
                p.sucursal?.nombre ? `Sucursal: ${p.sucursal.nombre}` : '',
                p.concesionaria?.telefono ? `Tel: ${p.concesionaria.telefono}` : '',
            ].filter(Boolean);
            drawEncabezado(doc, brand, infoLineas);

            doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
                .text('PRESUPUESTO', 50, 50, { align: 'right' });
            doc.fillColor(muted).fontSize(10).font('Helvetica')
                .text(`N° ${p.nroPresupuesto || String(p.id).padStart(6, '0')}`, { align: 'right' })
                .text(`Fecha: ${fecha(p.fechaCreacion)}`, { align: 'right' });
            if (p.validoHasta) doc.text(`Válido hasta: ${fecha(p.validoHasta)}`, { align: 'right' });

            doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').stroke();

            // ── Cliente y vendedor ────────────────────────────────────────────────
            let y = 150;
            const bloque = (titulo: string, lineas: string[], x: number) => {
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text(titulo.toUpperCase(), x, y);
                doc.fillColor('#111827').fontSize(10).font('Helvetica');
                lineas.forEach((l, i) => doc.text(l, x, y + 15 + i * 14, { width: 230 }));
            };

            bloque('Cliente', [
                p.cliente?.nombre || '—',
                p.cliente?.dni ? `DNI/CUIT: ${p.cliente.dni}` : '',
                p.cliente?.telefono ? `Tel: ${p.cliente.telefono}` : '',
                p.cliente?.email || '',
            ].filter(Boolean), 50);

            bloque('Atendido por', [
                p.vendedor?.nombre || '—',
                p.vendedor?.email || '',
            ].filter(Boolean), 310);

            y += 90;

            // ── Detalle ───────────────────────────────────────────────────────────
            const fila = (label: string, valor: string, negrita = false) => {
                doc.fillColor('#111827').fontSize(10).font(negrita ? 'Helvetica-Bold' : 'Helvetica');
                doc.text(label, 50, y, { width: 380 });
                doc.text(valor, 430, y, { width: 115, align: 'right' });
                y += 18;
            };

            doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('DETALLE', 50, y);
            y += 16;
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 8;

            for (const it of p.items) {
                const v = it.vehiculo;
                const nombre = `${v?.marca || ''} ${v?.modelo || ''}${v?.anio ? ` ${v.anio}` : ''}${v?.dominio ? ` (${v.dominio})` : ''}`.trim() || 'Vehículo';
                const desc = Number(it.descuento);
                fila(nombre, money(it.precioLista, moneda));
                if (desc > 0) fila('   Descuento', `- ${money(desc, moneda)}`);
            }
            for (const e of p.extras) fila(`Extra: ${e.descripcion}`, money(e.monto, moneda));
            if (p.canje) {
                const det = [p.canje.descripcion, p.canje.dominio ? `(${p.canje.dominio})` : ''].filter(Boolean).join(' ');
                fila(`Canje: ${det || 'vehículo entregado'}`, `- ${money(valorCanje, moneda)}`);
            }

            y += 4;
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 8;
            fila('TOTAL', money(total, moneda), true);

            // ── Observaciones ─────────────────────────────────────────────────────
            if (p.observaciones) {
                y += 14;
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('OBSERVACIONES', 50, y);
                y += 16;
                doc.fillColor('#111827').fontSize(9).font('Helvetica')
                    .text(p.observaciones, 50, y, { width: 495 });
            }

            // ── Pie (marca del tenant, o AUTENZA por defecto) ─────────────────────
            drawPie(doc, brand);
            doc.fillColor(muted).fontSize(8).font('Helvetica')
                .text(
                    `Presupuesto sujeto a disponibilidad de las unidades.   ·   Generado el ${new Date().toLocaleString('es-AR')}`,
                    50, 760, { align: 'center', width: 495 }
                );
            doc.text('Documento no válido como factura.', 50, 772, { align: 'center', width: 495 });

            doc.end();
        } catch (error) {
            next(error);
        }
    }

    // GET /api/clientes/:id/estado-cuenta/pdf → PDF con la cuenta corriente del
    // cliente: por cada financiación, el plan de cuotas (pagado/saldo) y los
    // totales. Mismo criterio de "vencido" que el reporte de estado de cuenta
    // (vencimiento < hoy a medianoche UTC).
    static async estadoCuentaPdf(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.id);
            const cliente = await prisma.cliente.findFirst({
                where: { id },
                include: { concesionaria: { select: marcaSelect } },
            }) as any;
            if (!cliente) throw new NotFoundException('Cliente');

            const financiaciones = await prisma.financiacion.findMany({
                where: { clienteId: id },
                orderBy: { fechaInicio: 'desc' },
                include: {
                    // El filtro de borrados de la extensión no alcanza al include.
                    cuotasPlan: { where: { deletedAt: null }, orderBy: { nroCuota: 'asc' } },
                    venta: { select: { vehiculo: { select: { marca: true, modelo: true, dominio: true } } } },
                },
            }) as any[];

            const ahora = new Date();
            const inicioHoy = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));
            const nn = (v: unknown) => Number(v ?? 0);

            // Resumen por moneda (saldo pendiente + vencido) y próxima cuota global.
            const porMoneda = new Map<string, { pendiente: number; vencido: number }>();
            const futurasGlobal: Array<{ vencimiento: Date; monto: number; moneda: string }> = [];
            let cuotasVencidasTot = 0;

            const lineas: FinanciacionLinea[] = financiaciones.map((f) => {
                const acc = porMoneda.get(f.moneda) ?? { pendiente: 0, vencido: 0 };
                let saldoPendiente = 0;
                let cuotasVencidas = 0;

                const cuotas = (f.cuotasPlan as any[]).map((c) => {
                    const monto = nn(c.montoCuota);
                    const saldo = nn(c.saldoCuota);
                    // Refinanciada: el saldo se movió a otro contrato (saldoCuota
                    // quedó en 0), NO se pagó. No mostrar el monto como "pagado".
                    const pagado = c.estado === 'refinanciada' ? 0 : Math.max(0, monto - saldo);
                    // "Viva": ni pagada ni refinanciada y con saldo (igual que el reporte).
                    const viva = c.estado !== 'pagada' && c.estado !== 'refinanciada' && saldo > 0;
                    const vencida = viva && c.vencimiento < inicioHoy;
                    if (viva) {
                        saldoPendiente += saldo;
                        acc.pendiente += saldo;
                        if (vencida) { cuotasVencidas += 1; acc.vencido += saldo; }
                        else futurasGlobal.push({ vencimiento: c.vencimiento, monto: saldo, moneda: f.moneda });
                    }
                    const estadoLabel = c.estado === 'pagada' ? 'Pagada'
                        : c.estado === 'refinanciada' ? 'Refinanc.'
                            : saldo <= 0 ? 'Pagada'
                                : vencida ? 'Vencida'
                                    : pagado > 0 ? 'Parcial'
                                        : 'Pendiente';
                    return { nro: c.nroCuota, vencimiento: c.vencimiento, monto, pagado, saldo, estadoLabel, vencida };
                });

                porMoneda.set(f.moneda, acc);
                cuotasVencidasTot += cuotasVencidas;
                const veh = f.venta?.vehiculo;
                return {
                    id: f.id,
                    vehiculo: veh ? `${veh.marca ?? ''} ${veh.modelo ?? ''}`.trim() : '',
                    dominio: veh?.dominio ?? '',
                    fechaInicio: f.fechaInicio,
                    moneda: f.moneda,
                    montoFinanciado: nn(f.montoFinanciado),
                    estado: String(f.estado),
                    cuotasTotal: (f.cuotasPlan as any[]).length,
                    cuotasPagadas: (f.cuotasPlan as any[]).filter((c) => c.estado === 'pagada').length,
                    saldoPendiente,
                    cuotasVencidas,
                    cuotas,
                };
            });

            futurasGlobal.sort((a, b) => a.vencimiento.getTime() - b.vencimiento.getTime());

            const data: EstadoCuentaData = {
                cliente: {
                    nombre: cliente.nombre,
                    dni: cliente.dni ?? null,
                    telefono: cliente.telefono ?? null,
                    email: cliente.email ?? null,
                    concesionaria: cliente.concesionaria ?? null,
                },
                hoy: ahora,
                generadoEl: ahora.toLocaleString('es-AR'),
                financiaciones: lineas,
                resumen: {
                    saldoPorMoneda: Array.from(porMoneda.entries())
                        .map(([moneda, v]) => ({ moneda, pendiente: v.pendiente, vencido: v.vencido }))
                        .sort((a, b) => a.moneda.localeCompare(b.moneda)),
                    cuotasVencidas: cuotasVencidasTot,
                    proxima: futurasGlobal[0] ?? null,
                },
            };

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="estado-cuenta-cliente-${id}.pdf"`);
            // bufferPages: el estado de cuenta puede ocupar varias páginas y el pie
            // se estampa en TODAS al final (renderEstadoCuenta recorre el rango).
            const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
            doc.pipe(res);

            const brand = await resolveBranding(cliente.concesionaria);
            renderEstadoCuenta(doc, brand, data);
            doc.end();
        } catch (error) {
            next(error);
        }
    }
}
