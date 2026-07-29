import { Request, Response, NextFunction } from 'express';
import PDFDocument from 'pdfkit';
import prisma from '../../infrastructure/database/prisma';
import { NotFoundException } from '../../domain/exceptions/BaseException';

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
                    concesionaria: { select: { nombre: true, cuit: true, email: true } },
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

            // ── Paleta AUTENZA ────────────────────────────────────────────────────
            const accent = '#10b981';      // emerald de marca (antes índigo #4f46e5)
            const muted = '#6b7280';
            const brandStops: Array<[number, string]> = [[0, '#10b981'], [0.5, '#06b6d4'], [1, '#8b5cf6']];
            const W = doc.page.width;

            // Isotipo AUTENZA dibujado como vector (mismos paths que el SVG de marca).
            const drawIsotipo = (x: number, y: number, size: number, color: string) => {
                const s = size / 56;
                doc.save();
                doc.translate(x, y).scale(s);
                doc.strokeColor(color).lineJoin('round').lineCap('round');
                doc.lineWidth(2.6).path('M28 6 L47 17 L47 39 L28 50 L9 39 L9 17 Z').stroke();
                doc.lineWidth(3.4).path('M19 43 L28 21 L37 43').stroke();
                doc.lineWidth(3.4).path('M23 34 L33 34').stroke();
                doc.fillColor(color).circle(28, 6, 3.2).fill();
                doc.restore();
            };

            // Franja de gradiente de marca en el borde superior (firma visual AUTENZA).
            const topBand = doc.linearGradient(0, 0, W, 0);
            brandStops.forEach(([o, c]) => topBand.stop(o, c));
            doc.rect(0, 0, W, 6).fill(topBand);

            // ── Encabezado ────────────────────────────────────────────────────────
            doc.fillColor(accent).fontSize(20).font('Helvetica-Bold')
                .text(venta.concesionaria?.nombre || 'Concesionaria', 50, 50);
            doc.fillColor(muted).fontSize(9).font('Helvetica');
            if (venta.concesionaria?.cuit) doc.text(`CUIT: ${venta.concesionaria.cuit}`);
            if (venta.sucursal?.nombre) doc.text(`Sucursal: ${venta.sucursal.nombre}`);
            if (venta.sucursal?.direccion) doc.text(venta.sucursal.direccion);

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

            // ── Pie con marca de plataforma AUTENZA ───────────────────────────────
            const footerTop = 720;
            const ruleGrad = doc.linearGradient(50, 0, 545, 0);
            brandStops.forEach(([o, c]) => ruleGrad.stop(o, c));
            doc.rect(50, footerTop, 495, 1.5).fill(ruleGrad);

            drawIsotipo(W / 2 - 6.5, footerTop + 10, 13, accent);
            doc.fillColor(accent).fontSize(8).font('Helvetica-Bold')
                .text('AUTENZA', 50, footerTop + 27, { align: 'center', width: W - 100, characterSpacing: 2 });

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
                            concesionaria: { select: { nombre: true, cuit: true } },
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

            // ── Paleta AUTENZA (misma firma visual que el comprobante de venta) ────
            const accent = '#10b981';
            const muted = '#6b7280';
            const brandStops: Array<[number, string]> = [[0, '#10b981'], [0.5, '#06b6d4'], [1, '#8b5cf6']];
            const W = doc.page.width;

            const drawIsotipo = (x: number, y: number, size: number, color: string) => {
                const s = size / 56;
                doc.save();
                doc.translate(x, y).scale(s);
                doc.strokeColor(color).lineJoin('round').lineCap('round');
                doc.lineWidth(2.6).path('M28 6 L47 17 L47 39 L28 50 L9 39 L9 17 Z').stroke();
                doc.lineWidth(3.4).path('M19 43 L28 21 L37 43').stroke();
                doc.lineWidth(3.4).path('M23 34 L33 34').stroke();
                doc.fillColor(color).circle(28, 6, 3.2).fill();
                doc.restore();
            };

            const topBand = doc.linearGradient(0, 0, W, 0);
            brandStops.forEach(([o, c]) => topBand.stop(o, c));
            doc.rect(0, 0, W, 6).fill(topBand);

            // ── Encabezado ────────────────────────────────────────────────────────
            doc.fillColor(accent).fontSize(20).font('Helvetica-Bold')
                .text(fin?.concesionaria?.nombre || 'Concesionaria', 50, 50);
            doc.fillColor(muted).fontSize(9).font('Helvetica');
            if (fin?.concesionaria?.cuit) doc.text(`CUIT: ${fin.concesionaria.cuit}`);
            if (fin?.sucursal?.nombre) doc.text(`Sucursal: ${fin.sucursal.nombre}`);
            if (fin?.sucursal?.direccion) doc.text(fin.sucursal.direccion);

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

            // ── Pie con marca de plataforma AUTENZA ───────────────────────────────
            const footerTop = 720;
            const ruleGrad = doc.linearGradient(50, 0, 545, 0);
            brandStops.forEach(([o, c]) => ruleGrad.stop(o, c));
            doc.rect(50, footerTop, 495, 1.5).fill(ruleGrad);

            drawIsotipo(W / 2 - 6.5, footerTop + 10, 13, accent);
            doc.fillColor(accent).fontSize(8).font('Helvetica-Bold')
                .text('AUTENZA', 50, footerTop + 27, { align: 'center', width: W - 100, characterSpacing: 2 });

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
                    concesionaria: { select: { nombre: true, cuit: true, email: true, telefono: true } },
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

            // ── Paleta AUTENZA (misma firma visual que el comprobante de venta) ────
            const accent = '#10b981';
            const muted = '#6b7280';
            const brandStops: Array<[number, string]> = [[0, '#10b981'], [0.5, '#06b6d4'], [1, '#8b5cf6']];
            const W = doc.page.width;

            const drawIsotipo = (x: number, y: number, size: number, color: string) => {
                const s = size / 56;
                doc.save();
                doc.translate(x, y).scale(s);
                doc.strokeColor(color).lineJoin('round').lineCap('round');
                doc.lineWidth(2.6).path('M28 6 L47 17 L47 39 L28 50 L9 39 L9 17 Z').stroke();
                doc.lineWidth(3.4).path('M19 43 L28 21 L37 43').stroke();
                doc.lineWidth(3.4).path('M23 34 L33 34').stroke();
                doc.fillColor(color).circle(28, 6, 3.2).fill();
                doc.restore();
            };

            const topBand = doc.linearGradient(0, 0, W, 0);
            brandStops.forEach(([o, c]) => topBand.stop(o, c));
            doc.rect(0, 0, W, 6).fill(topBand);

            // ── Encabezado ────────────────────────────────────────────────────────
            doc.fillColor(accent).fontSize(20).font('Helvetica-Bold')
                .text(p.concesionaria?.nombre || 'Concesionaria', 50, 50);
            doc.fillColor(muted).fontSize(9).font('Helvetica');
            if (p.concesionaria?.cuit) doc.text(`CUIT: ${p.concesionaria.cuit}`);
            if (p.sucursal?.nombre) doc.text(`Sucursal: ${p.sucursal.nombre}`);
            if (p.concesionaria?.telefono) doc.text(`Tel: ${p.concesionaria.telefono}`);

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

            // ── Pie con marca de plataforma AUTENZA ───────────────────────────────
            const footerTop = 720;
            const ruleGrad = doc.linearGradient(50, 0, 545, 0);
            brandStops.forEach(([o, c]) => ruleGrad.stop(o, c));
            doc.rect(50, footerTop, 495, 1.5).fill(ruleGrad);

            drawIsotipo(W / 2 - 6.5, footerTop + 10, 13, accent);
            doc.fillColor(accent).fontSize(8).font('Helvetica-Bold')
                .text('AUTENZA', 50, footerTop + 27, { align: 'center', width: W - 100, characterSpacing: 2 });

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
}
