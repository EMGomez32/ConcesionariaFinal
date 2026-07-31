import { Branding, drawEncabezado, drawPie, drawTopBand } from './branding';

// ── Estado de cuenta del cliente (PDF) ───────────────────────────────────────
// Documento que la concesionaria le entrega/manda al cliente con la foto de su
// deuda: por cada financiación, el plan de cuotas (qué pagó y qué debe) y los
// totales. Reusa el branding del tenant (branding.ts): sale con la marca de la
// concesionaria, o el look AUTENZA por defecto. Renderiza data PLANA (sin Prisma)
// para poder testearse aparte; el controller arma esa data.

const money = (n: number, moneda = 'ARS') =>
    `${moneda === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('es-AR') : '—';

/** Una cuota del plan, ya calculada (pagado/saldo/estado legible). */
export interface CuotaLinea {
    nro: number;
    vencimiento: Date;
    monto: number;
    pagado: number;
    saldo: number;
    estadoLabel: string;
    vencida: boolean;
}

/** Una financiación con su plan y sus totales. */
export interface FinanciacionLinea {
    id: number;
    vehiculo: string;
    dominio: string;
    fechaInicio: Date;
    moneda: string;
    montoFinanciado: number;
    estado: string;
    cuotasTotal: number;
    cuotasPagadas: number;
    saldoPendiente: number;
    cuotasVencidas: number;
    cuotas: CuotaLinea[];
}

export interface EstadoCuentaData {
    cliente: {
        nombre: string;
        dni: string | null;
        telefono: string | null;
        email: string | null;
        concesionaria: { cuit?: string | null; telefono?: string | null; direccion?: string | null } | null;
    };
    hoy: Date;
    generadoEl: string;
    financiaciones: FinanciacionLinea[];
    resumen: {
        saldoPorMoneda: Array<{ moneda: string; pendiente: number; vencido: number }>;
        cuotasVencidas: number;
        proxima: { vencimiento: Date; monto: number; moneda: string } | null;
    };
}

const PAGE_BOTTOM = 690; // límite de contenido antes de saltar de página (pie en 720)

export function renderEstadoCuenta(doc: PDFKit.PDFDocument, b: Branding, data: EstadoCuentaData) {
    const accent = b.accent;
    const muted = b.muted;

    // ── Encabezado (marca del tenant) + título ────────────────────────────────
    const infoLineas = [
        data.cliente.concesionaria?.cuit ? `CUIT: ${data.cliente.concesionaria.cuit}` : '',
        data.cliente.concesionaria?.telefono ? `Tel: ${data.cliente.concesionaria.telefono}` : '',
        data.cliente.concesionaria?.direccion || '',
    ].filter(Boolean);
    drawEncabezado(doc, b, infoLineas);

    doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
        .text('ESTADO DE CUENTA', 50, 50, { align: 'right' });
    doc.fillColor(muted).fontSize(10).font('Helvetica')
        .text(`Al ${fecha(data.hoy)}`, { align: 'right' });

    doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').stroke();

    // ── Cliente (izq) + Resumen (der) ─────────────────────────────────────────
    doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('CLIENTE', 50, 150);
    doc.fillColor('#111827').fontSize(10).font('Helvetica');
    const cab = [
        data.cliente.nombre || '—',
        data.cliente.dni ? `DNI/CUIT: ${data.cliente.dni}` : '',
        data.cliente.telefono ? `Tel: ${data.cliente.telefono}` : '',
        data.cliente.email || '',
    ].filter(Boolean);
    // Una línea por campo con ellipsis: un nombre/email largo se recorta en vez
    // de envolver y pisar el renglón de abajo (posiciones Y fijas).
    cab.forEach((l, i) => doc.text(l, 50, 165 + i * 13, { width: 260, lineBreak: false, ellipsis: true }));

    const rx = 330;
    const saldoStr = data.resumen.saldoPorMoneda.filter((m) => m.pendiente !== 0)
        .map((m) => money(m.pendiente, m.moneda)).join('  ·  ') || money(0);
    const vencStr = data.resumen.saldoPorMoneda.filter((m) => m.vencido !== 0)
        .map((m) => money(m.vencido, m.moneda)).join('  ·  ');
    // fontSize 9 + una sola línea con ellipsis: entra el caso de 2 monedas
    // (ARS+USD) sin envolver, y si algo se pasa se recorta en vez de solaparse.
    const rOpt = { width: 215, lineBreak: false as const, ellipsis: true as const };
    doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('RESUMEN', rx, 150);
    doc.fillColor('#111827').fontSize(9).font('Helvetica');
    doc.text(`Saldo pendiente: ${saldoStr}`, rx, 165, rOpt);
    doc.text(`Cuotas vencidas: ${data.resumen.cuotasVencidas}${vencStr ? ` (${vencStr})` : ''}`, rx, 179, rOpt);
    doc.text(
        `Próx. vencimiento: ${data.resumen.proxima ? `${fecha(data.resumen.proxima.vencimiento)} · ${money(data.resumen.proxima.monto, data.resumen.proxima.moneda)}` : '—'}`,
        rx, 193, rOpt,
    );

    let y = Math.max(165 + cab.length * 13, 206) + 16;

    // ── Detalle por financiación (con paginación) ─────────────────────────────
    const cols = { nro: 50, venc: 82, monto: 168, pagado: 268, saldo: 363, estado: 462 };
    const w = { monto: 92, pagado: 88, saldo: 92, estado: 83 };

    const colHeader = () => {
        doc.fillColor(muted).fontSize(7.5).font('Helvetica-Bold');
        doc.text('N°', cols.nro, y);
        doc.text('VENCE', cols.venc, y);
        doc.text('MONTO', cols.monto, y, { width: w.monto, align: 'right' });
        doc.text('PAGADO', cols.pagado, y, { width: w.pagado, align: 'right' });
        doc.text('SALDO', cols.saldo, y, { width: w.saldo, align: 'right' });
        doc.text('ESTADO', cols.estado, y, { width: w.estado });
        y += 11;
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
        y += 4;
    };

    if (!data.financiaciones.length) {
        doc.fillColor(muted).fontSize(10).font('Helvetica')
            .text('El cliente no tiene financiaciones registradas.', 50, y);
    }

    for (const f of data.financiaciones) {
        // Espacio para el sub-header (2 líneas) + encabezado de columnas + 1 fila.
        if (y + 70 > PAGE_BOTTOM) { doc.addPage(); drawTopBand(doc, b); y = 60; }

        doc.fillColor(accent).fontSize(10).font('Helvetica-Bold')
            .text(`${f.vehiculo || `Financiación #${f.id}`}${f.dominio ? `  ·  ${f.dominio}` : ''}`, 50, y, { width: 495, lineBreak: false, ellipsis: true });
        y += 15;
        doc.fillColor(muted).fontSize(8).font('Helvetica')
            .text(
                `Financiación #${f.id}  ·  Inicio ${fecha(f.fechaInicio)}  ·  ${f.moneda}  ·  Monto ${money(f.montoFinanciado, f.moneda)}  ·  ${f.cuotasPagadas}/${f.cuotasTotal} pagas  ·  Saldo ${money(f.saldoPendiente, f.moneda)}${f.cuotasVencidas ? `  ·  ${f.cuotasVencidas} vencidas` : ''}  ·  ${f.estado}`,
                50, y, { width: 495, lineBreak: false, ellipsis: true },
            );
        y += 16;
        colHeader();

        for (const c of f.cuotas) {
            // Salto de página dentro de un plan largo: se repite el encabezado de columnas.
            if (y + 14 > PAGE_BOTTOM) { doc.addPage(); drawTopBand(doc, b); y = 60; colHeader(); }
            doc.fontSize(8.5).font('Helvetica').fillColor('#111827');
            doc.text(String(c.nro), cols.nro, y);
            doc.text(fecha(c.vencimiento), cols.venc, y);
            doc.text(money(c.monto, f.moneda), cols.monto, y, { width: w.monto, align: 'right' });
            doc.text(money(c.pagado, f.moneda), cols.pagado, y, { width: w.pagado, align: 'right' });
            doc.text(money(c.saldo, f.moneda), cols.saldo, y, { width: w.saldo, align: 'right' });
            doc.fillColor(c.vencida ? '#dc2626' : muted).text(c.estadoLabel, cols.estado, y, { width: w.estado });
            y += 13;
        }
        y += 12;
    }

    // ── Pie en CADA página (marca del tenant + disclaimer) ────────────────────
    // El doc se crea con bufferPages, así que las páginas siguen editables: se
    // recorre todo el rango y se estampa el pie en cada una (no sólo la última).
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        drawPie(doc, b);
        doc.fillColor(muted).fontSize(8).font('Helvetica')
            .text(`Estado de cuenta generado el ${data.generadoEl}`, 50, 760, { align: 'center', width: 495 });
        doc.text('Documento informativo. No válido como factura.', 50, 772, { align: 'center', width: 495 });
    }
}
