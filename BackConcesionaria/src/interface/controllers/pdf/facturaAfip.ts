import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Branding, drawEncabezado, drawPie } from './branding';
import { CBTE_LETRA } from '../../../domain/services/afip/fiscal';
import type { TipoComprobanteAfip, CondicionIva } from '@prisma/client';

/** Datos que necesita el PDF de la factura (ya resueltos por el controller). */
export interface FacturaPdfData {
    tipoComprobante: TipoComprobanteAfip;
    codigoAfip: number; // 1 / 6 / 11
    puntoVenta: number;
    numero: number;
    fechaComprobante: Date;
    // Emisor
    emisorNombre: string;
    emisorRazonSocial: string | null;
    emisorCuit: string | null;
    emisorCondIva: CondicionIva | null;
    emisorDireccion: string | null;
    emisorIngresosBrutos?: string | null;
    // Receptor
    receptorNombre: string;
    receptorDocLabel: string; // "CUIT" | "DNI" | ...
    receptorDocNro: string;
    receptorCondIva: CondicionIva;
    receptorDireccion: string | null;
    // Ítem
    detalle: string;
    // Importes
    moneda: string; // PES / DOL
    neto: number;
    alicuotaIva: number;
    iva: number;
    total: number;
    // AFIP
    cae: string;
    caeVencimiento: Date | null;
    qrUrl: string;
    esMock: boolean;
}

const CONDICION_LABEL: Record<CondicionIva, string> = {
    responsable_inscripto: 'Responsable Inscripto',
    monotributo: 'Responsable Monotributo',
    exento: 'IVA Exento',
    consumidor_final: 'Consumidor Final',
};

const money = (n: number, moneda: string) => {
    const simbolo = moneda === 'DOL' ? 'US$' : '$';
    return `${simbolo} ${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// fechaComprobante y caeVencimiento son columnas @db.Date (medianoche UTC). Se
// formatean forzando timeZone UTC para que la fecha calendario impresa sea la real
// y no se corra un día en zonas de offset negativo (Argentina, UTC-3).
const fecha = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—');

/**
 * Dibuja una factura electrónica AFIP (letra A/B/C) en el documento pdfkit dado.
 * Layout formal: emisor + recuadro de letra, receptor, detalle con IVA discriminado
 * (A) o total final (B/C), y el pie con CAE + vencimiento + QR de la RG 4291.
 */
export async function renderFacturaAfip(doc: PDFKit.PDFDocument, d: FacturaPdfData, brand: Branding): Promise<void> {
    const muted = brand.muted;
    const dark = '#111827';
    const letra = CBTE_LETRA[d.tipoComprobante];

    // ── Encabezado con datos del emisor ───────────────────────────────────────
    const infoLineas = [
        d.emisorCuit ? `CUIT: ${d.emisorCuit}` : '',
        d.emisorCondIva ? CONDICION_LABEL[d.emisorCondIva] : '',
        d.emisorDireccion || '',
    ].filter(Boolean);
    drawEncabezado(doc, brand, infoLineas);

    // ── Recuadro de la LETRA (A/B/C) centrado arriba ──────────────────────────
    // Caja con la letra grande + el código AFIP, al estilo de una factura real.
    const boxW = 46, boxX = (doc.page.width - boxW) / 2, boxY = 44, boxH = 46;
    doc.save();
    doc.rect(boxX, boxY, boxW, boxH).lineWidth(1).strokeColor('#111827').fillColor('#ffffff').fillAndStroke('#ffffff', '#111827');
    doc.fillColor('#111827').fontSize(30).font('Helvetica-Bold').text(letra, boxX, boxY + 4, { width: boxW, align: 'center' });
    doc.fillColor(muted).fontSize(7).font('Helvetica').text(`COD. ${String(d.codigoAfip).padStart(2, '0')}`, boxX - 10, boxY + boxH + 2, { width: boxW + 20, align: 'center' });
    doc.restore();

    // ── Tipo/numeración a la derecha ──────────────────────────────────────────
    doc.fillColor(dark).fontSize(16).font('Helvetica-Bold').text('FACTURA', 350, 46, { width: 195, align: 'right' });
    doc.fillColor(dark).fontSize(10).font('Helvetica')
        .text(`Punto de Venta: ${String(d.puntoVenta).padStart(4, '0')}`, 350, 68, { width: 195, align: 'right' })
        .text(`Comp. Nro: ${String(d.numero).padStart(8, '0')}`, { width: 195, align: 'right' })
        .text(`Fecha: ${fecha(d.fechaComprobante)}`, { width: 195, align: 'right' });

    doc.moveTo(50, 132).lineTo(545, 132).strokeColor('#e5e7eb').stroke();

    // ── Receptor ──────────────────────────────────────────────────────────────
    let y = 144;
    doc.fillColor(brand.accent).fontSize(9).font('Helvetica-Bold').text('CLIENTE', 50, y);
    y += 14;
    const recLineas = [
        d.receptorNombre || '—',
        `${d.receptorDocLabel}: ${d.receptorDocNro}`,
        CONDICION_LABEL[d.receptorCondIva],
        d.receptorDireccion ? `Domicilio: ${d.receptorDireccion}` : '',
    ].filter(Boolean);
    doc.fillColor(dark).fontSize(10).font('Helvetica');
    recLineas.forEach((l, i) => doc.text(l, 50, y + i * 14, { width: 495, lineBreak: false, ellipsis: true }));
    y += recLineas.length * 14 + 10;

    // ── Detalle ───────────────────────────────────────────────────────────────
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
    y += 8;
    doc.fillColor(muted).fontSize(8.5).font('Helvetica-Bold');
    doc.text('DESCRIPCIÓN', 50, y, { width: 345 });
    doc.text(d.tipoComprobante === 'factura_a' ? 'IMPORTE NETO' : 'IMPORTE', 395, y, { width: 150, align: 'right' });
    y += 14;
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
    y += 8;
    doc.fillColor(dark).fontSize(10).font('Helvetica');
    doc.text(d.detalle, 50, y, { width: 345, height: 28, ellipsis: true });
    // En A el renglón muestra el neto; en B/C el importe final (IVA no se discrimina).
    doc.text(money(d.tipoComprobante === 'factura_a' ? d.neto : d.total, d.moneda), 395, y, { width: 150, align: 'right' });
    y += 34;

    // ── Totales ───────────────────────────────────────────────────────────────
    doc.moveTo(320, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
    y += 8;
    const totalRow = (label: string, valor: string, negrita = false) => {
        doc.fillColor(dark).fontSize(negrita ? 12 : 10).font(negrita ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(label, 320, y, { width: 120 });
        doc.text(valor, 445, y, { width: 100, align: 'right' });
        y += negrita ? 20 : 16;
    };
    // Factura A: IVA discriminado (neto + IVA + total). B/C: sólo el total.
    if (d.tipoComprobante === 'factura_a') {
        totalRow('Neto Gravado', money(d.neto, d.moneda));
        totalRow(`IVA ${d.alicuotaIva.toLocaleString('es-AR')}%`, money(d.iva, d.moneda));
    }
    totalRow('TOTAL', money(d.total, d.moneda), true);

    // ── Pie fiscal: CAE + vencimiento + QR ────────────────────────────────────
    const pieY = 690;
    let qrBuf: Buffer | null = null;
    try {
        qrBuf = await QRCode.toBuffer(d.qrUrl, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
    } catch { qrBuf = null; }
    if (qrBuf) {
        try { doc.image(qrBuf, 50, pieY, { fit: [90, 90] }); } catch { /* buffer inválido */ }
    }
    doc.fillColor(dark).fontSize(11).font('Helvetica-Bold').text(`CAE N°: ${d.cae}`, 150, pieY + 8, { width: 395 });
    doc.fillColor(dark).fontSize(10).font('Helvetica').text(`Vto. CAE: ${fecha(d.caeVencimiento)}`, 150, pieY + 26, { width: 395 });
    doc.fillColor(muted).fontSize(8).font('Helvetica')
        .text('Comprobante autorizado por AFIP', 150, pieY + 44, { width: 395 });

    // Aviso de modo mock: deja explícito que el CAE es simulado y sin validez fiscal.
    if (d.esMock) {
        doc.save();
        doc.rotate(-18, { origin: [300, 400] });
        doc.fillColor('#ef4444').opacity(0.12).fontSize(70).font('Helvetica-Bold')
            .text('MODO DEMO', 70, 380, { width: 500, align: 'center' });
        doc.restore();
        doc.opacity(1);
    }

    // ── Pie de marca ──────────────────────────────────────────────────────────
    drawPie(doc, brand);
    doc.fillColor(muted).fontSize(8).font('Helvetica')
        .text(
            d.esMock
                ? 'Comprobante generado en MODO DEMO — CAE simulado, SIN validez fiscal.'
                : `Generado el ${new Date().toLocaleString('es-AR')}`,
            50, 792, { align: 'center', width: 495 },
        );
}

/** Crea el PDFDocument A4 estándar de una factura. */
export function nuevaFacturaDoc(): PDFKit.PDFDocument {
    return new PDFDocument({ size: 'A4', margin: 50 });
}
