import { storage } from '../../../infrastructure/storage/LocalStorageAdapter';

// ── Marca de los documentos (PDF) por concesionaria ──────────────────────────
// Resuelve la identidad visual de un PDF a partir de la concesionaria dueña del
// documento. Si el tenant cargó su marca (logo / color / pie), se usa la suya;
// si no cargó nada, se cae al look AUTENZA por defecto (pensado para demos).
//
// El objetivo del feature: cuando el sistema está en producción para una
// concesionaria real, sus comprobantes salen con SU marca, no con la de AUTENZA.

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Paleta AUTENZA (gradiente emerald → cyan → violet). Default cuando no hay marca. */
const AUTENZA_STOPS: Array<[number, string]> = [[0, '#10b981'], [0.5, '#06b6d4'], [1, '#8b5cf6']];
const AUTENZA_ACCENT = '#10b981';
const MUTED = '#6b7280';

export interface Branding {
    /** Color de acento para títulos/labels (color del tenant o emerald AUTENZA). */
    accent: string;
    /** Gris de textos secundarios (constante). */
    muted: string;
    /** Stops del gradiente de la banda superior y la regla del pie. */
    stops: Array<[number, string]>;
    /** true si el tenant configuró alguna marca propia (logo/color/pie). */
    branded: boolean;
    /** Binario del logo (PNG/JPG) listo para embeber, o null. */
    logo: Buffer | null;
    /** Nombre de la concesionaria (para el pie del documento). */
    nombre: string;
    /** Pie de página propio del tenant (contacto/legal), o null. */
    pie: string | null;
    /** Sitio web del tenant (se muestra en el pie), o null. */
    sitioWeb: string | null;
}

/**
 * Resuelve la marca de un PDF. `conc` es la concesionaria incluida en la query
 * del documento (debe traer logoStorageKey/colorPrimario/colorSecundario/pdfPie).
 */
export async function resolveBranding(conc: any): Promise<Branding> {
    const primario = conc?.colorPrimario && HEX.test(conc.colorPrimario) ? conc.colorPrimario : null;
    const secundario = conc?.colorSecundario && HEX.test(conc.colorSecundario) ? conc.colorSecundario : null;
    const pie = (conc?.pdfPie ?? '').trim() || null;
    const sitioWeb = (conc?.sitioWeb ?? '').trim() || null;

    // Color base de la marca: el primario, o el secundario si sólo se cargó ese
    // (así el color elegido nunca se ignora). El gradiente usa ambos sólo cuando
    // los dos están; si hay uno solo, la banda queda sólida con ese color.
    const colorBase = primario || secundario;

    // `branded` se decide por la CONFIG (no por si el binario se pudo leer): si un
    // tenant configuró su marca pero el archivo del logo falla al leerse, igual se
    // respeta su identidad (nombre en el pie, sin AUTENZA) en vez de resucitar la
    // marca de la plataforma.
    const branded = !!(conc?.logoStorageKey || colorBase || pie || sitioWeb);

    let logo: Buffer | null = null;
    if (conc?.logoStorageKey) {
        try { logo = await storage.read(conc.logoStorageKey); } catch { logo = null; }
    }

    return {
        accent: colorBase || AUTENZA_ACCENT,
        muted: MUTED,
        stops: colorBase ? [[0, colorBase], [1, (primario && secundario) ? secundario : colorBase]] : AUTENZA_STOPS,
        branded,
        logo,
        nombre: conc?.nombre || 'Concesionaria',
        pie,
        sitioWeb,
    };
}

/** Isotipo AUTENZA como vector (sólo se usa en el pie del look por defecto). */
function drawIsotipo(doc: PDFKit.PDFDocument, x: number, y: number, size: number, color: string) {
    const s = size / 56;
    doc.save();
    doc.translate(x, y).scale(s);
    doc.strokeColor(color).lineJoin('round').lineCap('round');
    doc.lineWidth(2.6).path('M28 6 L47 17 L47 39 L28 50 L9 39 L9 17 Z').stroke();
    doc.lineWidth(3.4).path('M19 43 L28 21 L37 43').stroke();
    doc.lineWidth(3.4).path('M23 34 L33 34').stroke();
    doc.fillColor(color).circle(28, 6, 3.2).fill();
    doc.restore();
}

/** Banda de gradiente en el borde superior (firma visual del documento). */
export function drawTopBand(doc: PDFKit.PDFDocument, b: Branding) {
    const W = doc.page.width;
    const band = doc.linearGradient(0, 0, W, 0);
    b.stops.forEach(([o, c]) => band.stop(o, c));
    doc.rect(0, 0, W, 6).fill(band);
}

/**
 * Encabezado izquierdo: logo (si hay) o el nombre en grande, más las líneas de
 * datos (CUIT, sucursal, etc.). El bloque de la derecha (título del documento)
 * lo dibuja cada comprobante porque varía. Dibuja también la banda superior.
 */
export function drawEncabezado(doc: PDFKit.PDFDocument, b: Branding, infoLineas: string[]) {
    drawTopBand(doc, b);

    // Las líneas de datos van en Y ABSOLUTO fijo (no fluyendo bajo el nombre) y
    // el nombre está acotado con ellipsis: así, por más largo que sea el nombre,
    // el encabezado nunca cruza el divisor de y=130 ni pisa el cuerpo (y=150).
    let infoY: number;
    if (b.logo) {
        // Logo arriba; nombre + datos debajo (chico). El logo suele traer el
        // nombre, pero se repite en texto para dejar el CUIT/identidad legibles.
        try {
            doc.image(b.logo, 50, 46, { fit: [150, 34] });
        } catch {
            // Buffer no válido para pdfkit: se ignora y quedan sólo los datos.
        }
        doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold')
            .text(b.nombre, 50, 84, { width: 250, height: 13, lineBreak: false, ellipsis: true });
        infoY = 98;
    } else {
        // Sin logo: nombre en grande con el color de acento (look clásico). Hasta
        // 2 líneas (box de 40px) y ellipsis si se pasa.
        doc.fillColor(b.accent).fontSize(18).font('Helvetica-Bold')
            .text(b.nombre, 50, 48, { width: 250, height: 40, ellipsis: true });
        infoY = 94;
    }

    doc.fillColor(b.muted).fontSize(8.5).font('Helvetica');
    infoLineas.forEach((l, i) => doc.text(l, 50, infoY + i * 11, { width: 250, lineBreak: false, ellipsis: true }));
}

/**
 * Pie del documento. Con marca propia: nombre del tenant + su pie, SIN la marca
 * AUTENZA. Sin marca (demo): isotipo + wordmark AUTENZA. Las dos líneas finales
 * (vendedor/cobrador + disclaimer) las agrega cada comprobante después.
 */
export function drawPie(doc: PDFKit.PDFDocument, b: Branding) {
    const W = doc.page.width;
    const footerTop = 720;

    const ruleGrad = doc.linearGradient(50, 0, 545, 0);
    b.stops.forEach(([o, c]) => ruleGrad.stop(o, c));
    doc.rect(50, footerTop, 495, 1.5).fill(ruleGrad);

    if (b.branded) {
        // Nombre acotado a una línea (ellipsis) para que un nombre muy largo no
        // envuelva y pise el pie de abajo.
        doc.fillColor(b.accent).fontSize(9).font('Helvetica-Bold')
            .text(b.nombre, 50, footerTop + 10, { align: 'center', width: W - 100, height: 11, lineBreak: false, ellipsis: true });
        // Pie propio + sitio web en una línea (lo que haya). Altura acotada +
        // ellipsis para no invadir las líneas finales del documento (y=760/772).
        const pieLinea = [b.pie, b.sitioWeb].filter(Boolean).join('   ·   ');
        if (pieLinea) {
            doc.fillColor(b.muted).fontSize(8).font('Helvetica')
                .text(pieLinea, 50, footerTop + 23, { align: 'center', width: 495, height: 12, ellipsis: true });
        }
    } else {
        drawIsotipo(doc, W / 2 - 6.5, footerTop + 10, 13, b.accent);
        doc.fillColor(b.accent).fontSize(8).font('Helvetica-Bold')
            .text('AUTENZA', 50, footerTop + 27, { align: 'center', width: W - 100, characterSpacing: 2 });
    }
}
