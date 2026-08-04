import { Branding, drawEncabezado, drawPie, drawTopBand } from './branding';

// ── Liquidación de comisiones del vendedor (PDF) ─────────────────────────────
// Documento interno (employee-facing) con el detalle de las ventas de un vendedor
// en un período y la comisión que le corresponde (facturado × su % de perfil),
// por moneda. Reusa el branding del tenant (branding.ts). Renderiza data PLANA
// (sin Prisma) para poder testearse con un harness; el controller arma esa data.

const money = (n: number, moneda = 'ARS') =>
    `${moneda === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('es-AR') : '—';
const pct = (n: number) => `${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Una venta que generó comisión, ya calculada. */
export interface LiquidacionLinea {
    fecha: Date;
    vehiculo: string;
    dominio: string;
    cliente: string;
    moneda: string;
    facturado: number;
    comision: number;
}

/** Total por moneda (no se suman ARS con USD). */
export interface LiquidacionTotal {
    moneda: string;
    unidades: number;
    facturado: number;
    comision: number;
}

export interface LiquidacionData {
    vendedor: string;
    /** % de comisión del perfil del vendedor. */
    porcentaje: number;
    concesionaria: { cuit?: string | null; telefono?: string | null; direccion?: string | null } | null;
    periodo: { desde: string | null; hasta: string | null };
    generadoEl: string;
    lineas: LiquidacionLinea[];
    totales: LiquidacionTotal[];
    totalUnidades: number;
}

const PAGE_BOTTOM = 690; // límite de contenido antes de saltar de página (pie en 720)

export function renderLiquidacionComisiones(doc: PDFKit.PDFDocument, b: Branding, data: LiquidacionData) {
    const accent = b.accent;
    const muted = b.muted;

    // ── Encabezado (marca del tenant) + título ────────────────────────────────
    const infoLineas = [
        data.concesionaria?.cuit ? `CUIT: ${data.concesionaria.cuit}` : '',
        data.concesionaria?.telefono ? `Tel: ${data.concesionaria.telefono}` : '',
        data.concesionaria?.direccion || '',
    ].filter(Boolean);
    drawEncabezado(doc, b, infoLineas);

    doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
        .text('LIQUIDACIÓN DE COMISIONES', 50, 50, { align: 'right' });
    const periodoStr = (data.periodo.desde || data.periodo.hasta)
        ? `${data.periodo.desde ? fecha(data.periodo.desde) : '…'}  —  ${data.periodo.hasta ? fecha(data.periodo.hasta) : '…'}`
        : 'Todo el período';
    doc.fillColor(muted).fontSize(10).font('Helvetica').text(periodoStr, { align: 'right' });

    doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').stroke();

    // ── Vendedor (izq) + Resumen (der) ────────────────────────────────────────
    doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('VENDEDOR', 50, 150);
    doc.fillColor('#111827').fontSize(12).font('Helvetica-Bold')
        .text(data.vendedor || '—', 50, 164, { width: 260, lineBreak: false, ellipsis: true, height: 15 });
    doc.fillColor(muted).fontSize(9).font('Helvetica')
        .text(`Comisión de perfil: ${pct(data.porcentaje)}`, 50, 182, { width: 260, lineBreak: false, ellipsis: true });

    const rx = 330;
    const comisionStr = data.totales.filter((t) => t.comision !== 0).map((t) => money(t.comision, t.moneda)).join('  ·  ') || money(0);
    const rOpt = { width: 215, lineBreak: false as const, ellipsis: true as const };
    doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('RESUMEN', rx, 150);
    doc.fillColor('#111827').fontSize(9).font('Helvetica');
    doc.text(`Unidades vendidas: ${data.totalUnidades}`, rx, 165, rOpt);
    doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold')
        .text(`Comisión total: ${comisionStr}`, rx, 179, rOpt);

    let y = 214;

    // ── Detalle de ventas (con paginación) ────────────────────────────────────
    const cols = { fecha: 50, veh: 110, cli: 280, fact: 383, com: 460 };
    const w = { veh: 165, cli: 100, fact: 72, com: 85 };

    const colHeader = () => {
        doc.fillColor(muted).fontSize(7.5).font('Helvetica-Bold');
        doc.text('FECHA', cols.fecha, y);
        doc.text('VEHÍCULO', cols.veh, y);
        doc.text('CLIENTE', cols.cli, y);
        doc.text('FACTURADO', cols.fact, y, { width: w.fact, align: 'right' });
        doc.text('COMISIÓN', cols.com, y, { width: w.com, align: 'right' });
        y += 11;
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
        y += 4;
    };

    if (!data.lineas.length) {
        doc.fillColor(muted).fontSize(10).font('Helvetica')
            .text('El vendedor no tiene ventas en el período seleccionado.', 50, y);
        y += 20;
    } else {
        colHeader();
        for (const l of data.lineas) {
            if (y + 14 > PAGE_BOTTOM) { doc.addPage(); drawTopBand(doc, b); y = 60; colHeader(); }
            doc.fontSize(8.5).font('Helvetica').fillColor('#111827');
            doc.text(fecha(l.fecha), cols.fecha, y, { width: 56, lineBreak: false });
            const vehStr = `${l.vehiculo}${l.dominio ? ` · ${l.dominio}` : ''}`.trim() || '—';
            doc.text(vehStr, cols.veh, y, { width: w.veh, lineBreak: false, ellipsis: true, height: 11 });
            doc.text(l.cliente || '—', cols.cli, y, { width: w.cli, lineBreak: false, ellipsis: true, height: 11 });
            doc.text(money(l.facturado, l.moneda), cols.fact, y, { width: w.fact, align: 'right' });
            doc.text(money(l.comision, l.moneda), cols.com, y, { width: w.com, align: 'right' });
            y += 13;
        }
    }

    // ── Totales por moneda ────────────────────────────────────────────────────
    if (data.totales.length) {
        // Espacio para la regla + título + una fila por moneda antes de saltar.
        if (y + 30 + data.totales.length * 15 > PAGE_BOTTOM) { doc.addPage(); drawTopBand(doc, b); y = 60; }
        y += 8;
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
        y += 10;
        doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('TOTALES POR MONEDA', 50, y);
        y += 16;
        for (const t of data.totales) {
            doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold').text(t.moneda, cols.fecha, y, { width: 50, lineBreak: false });
            doc.font('Helvetica').fillColor(muted)
                .text(`${t.unidades} ${t.unidades === 1 ? 'unidad' : 'unidades'}  ·  Facturado ${money(t.facturado, t.moneda)}`,
                    cols.veh, y, { width: 250, lineBreak: false, ellipsis: true, height: 11 });
            doc.fillColor('#111827').font('Helvetica-Bold')
                .text(money(t.comision, t.moneda), 380, y, { width: 165, align: 'right' });
            y += 15;
        }
    }

    // Nota si el vendedor no tiene % configurado (toda la comisión da 0).
    if (data.porcentaje === 0) {
        y += 8;
        doc.fillColor('#b45309').fontSize(8).font('Helvetica-Oblique')
            .text('Nota: el vendedor no tiene un porcentaje de comisión configurado en su perfil; la comisión calculada es $0.', 50, y, { width: 495 });
    }

    // ── Pie en CADA página (marca del tenant + disclaimer) ────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        drawPie(doc, b);
        doc.fillColor(muted).fontSize(8).font('Helvetica')
            .text(`Liquidación generada el ${data.generadoEl}`, 50, 760, { align: 'center', width: 495 });
        doc.text('Documento interno de liquidación. No constituye recibo de sueldo.', 50, 772, { align: 'center', width: 495 });
    }
}
