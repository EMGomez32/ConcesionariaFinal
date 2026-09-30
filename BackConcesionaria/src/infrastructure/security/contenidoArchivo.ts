/**
 * Tipo REAL de un archivo subido, por su contenido (magic bytes), no por el mimetype ni
 * la extensión que declara el cliente (ambos falsificables). Se usa para:
 *  - rechazar lo que no es de un tipo permitido (un .html o un ejecutable con mimetype
 *    "image/png" antes entraba: el filtro de multer sólo miraba el header declarado);
 *  - fijar el mimetype y derivar la extensión guardada en el server (nunca del originalname).
 */

export interface TipoDetectado {
    mime: string;
    /** Extensión segura (minúsculas, sin punto) para guardar el archivo. */
    ext: string;
}

const ascii = (buf: Buffer, desde: number, hasta: number): string =>
    buf.subarray(desde, hasta).toString('latin1');

const BRANDS_HEIC = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const BRANDS_HEIF = new Set(['mif1', 'msf1', 'heif']);

/** Texto plano legítimo: sin bytes NUL, casi todo imprimible, y que NO parezca HTML/XML/SVG. */
function pareceTextoPlano(buf: Buffer): boolean {
    const muestra = buf.subarray(0, 8192);
    if (muestra.length === 0) return false;
    let raros = 0;
    for (const b of muestra) {
        if (b === 0) return false;
        // Control que no sea tab, salto de línea o retorno de carro.
        if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) raros++;
    }
    if (raros / muestra.length > 0.02) return false;
    // BOM UTF-8 + espacios iniciales; si arranca con "<" es marcado (HTML/SVG/XML), no texto.
    const inicio = muestra.toString('utf8').replace(/^﻿/, '').trimStart();
    return !inicio.startsWith('<');
}

/**
 * @param mimeDeclarado lo que dijo el cliente: sólo desempata donde el contenido es
 *   ambiguo (doc vs xls, txt vs csv); nunca habilita un tipo que el contenido no sea.
 * @returns el tipo real, o null si no es de ningún tipo permitido.
 */
export function detectarTipoArchivo(buf: Buffer, mimeDeclarado = ''): TipoDetectado | null {
    if (!buf || buf.length < 4) return null;

    // JPEG
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };

    // PNG
    if (buf.length >= 8 && buf[0] === 0x89 && ascii(buf, 1, 4) === 'PNG' && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
        return { mime: 'image/png', ext: 'png' };
    }

    // GIF
    if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };

    // WEBP: "RIFF" .... "WEBP"
    if (buf.length >= 12 && ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };

    // HEIC / HEIF: caja "ftyp" con una marca conocida
    if (buf.length >= 12 && ascii(buf, 4, 8) === 'ftyp') {
        const marca = ascii(buf, 8, 12);
        if (BRANDS_HEIC.has(marca)) return { mime: 'image/heic', ext: 'heic' };
        if (BRANDS_HEIF.has(marca)) return { mime: 'image/heif', ext: 'heif' };
    }

    // PDF: "%PDF-" al comienzo (la especificación tolera algo de basura previa)
    if (buf.subarray(0, 1024).includes('%PDF-', 0, 'latin1')) return { mime: 'application/pdf', ext: 'pdf' };

    // OLE2 (Word / Excel viejos): la firma es la misma; desempata lo declarado.
    if (buf.length >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0 && buf[4] === 0xa1 && buf[5] === 0xb1 && buf[6] === 0x1a && buf[7] === 0xe1) {
        if (mimeDeclarado === 'application/msword') return { mime: 'application/msword', ext: 'doc' };
        if (mimeDeclarado === 'application/vnd.ms-excel') return { mime: 'application/vnd.ms-excel', ext: 'xls' };
        return null;
    }

    // ZIP: sólo si es un OOXML (docx / xlsx). Un .zip cualquiera no es un tipo permitido.
    if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05) && (buf[3] === 0x04 || buf[3] === 0x06)) {
        if (buf.includes('word/', 0, 'latin1')) {
            return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
        }
        if (buf.includes('xl/', 0, 'latin1')) {
            return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
        }
        return null;
    }

    // Texto plano / CSV
    if (pareceTextoPlano(buf)) {
        if (mimeDeclarado === 'text/csv' || mimeDeclarado === 'application/vnd.ms-excel') return { mime: 'text/csv', ext: 'csv' };
        return { mime: 'text/plain', ext: 'txt' };
    }

    return null;
}

/** Extensión segura para un mimetype ya validado (fallback del storage; jamás del originalname). */
export function extensionParaMime(mime: string | undefined): string {
    switch (mime) {
        case 'image/jpeg': return 'jpg';
        case 'image/png': return 'png';
        case 'image/gif': return 'gif';
        case 'image/webp': return 'webp';
        case 'image/heic': return 'heic';
        case 'image/heif': return 'heif';
        case 'application/pdf': return 'pdf';
        case 'application/msword': return 'doc';
        case 'application/vnd.ms-excel': return 'xls';
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'docx';
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return 'xlsx';
        case 'text/csv': return 'csv';
        case 'text/plain': return 'txt';
        default: return 'bin';
    }
}
