import multer from 'multer';
import { RequestHandler } from 'express';
import { BaseException } from '../../domain/exceptions/BaseException';
import { detectarTipoArchivo } from '../../infrastructure/security/contenidoArchivo';
import { context } from '../../infrastructure/security/context';

/**
 * Multer lee el cuerpo por eventos del stream de la request, que NO conservan el AsyncLocalStorage
 * (tenant, usuario, correlationId) con el que entró el request. Se lo captura antes y se lo
 * RE-ENTRA al continuar: sin eso, lo que corre después de la subida ve un contexto vacío y, bajo el
 * rol app_rw, la RLS no encuentra ninguna fila (un 404 falso en vez de subir el archivo).
 */
const conContexto = (mw: RequestHandler): RequestHandler => (req, res, next) => {
    const ctx = context.get();
    mw(req, res, (err?: unknown) => (ctx ? context.run(ctx, () => next(err as any)) : next(err as any)));
};

const ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

const multerSingle = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
        else cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    },
}).single('file');

/** Errores de multer → 400/413 con mensaje claro (antes caían en el 500 genérico). */
const conErroresLimpios: RequestHandler = (req, res, next) => {
    multerSingle(req, res, (err: unknown) => {
        if (!err) return next();
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return next(new BaseException(413, 'El archivo supera el máximo de 25 MB', 'ARCHIVO_DEMASIADO_GRANDE'));
            }
            return next(new BaseException(400, 'Archivo inválido', 'ARCHIVO_INVALIDO'));
        }
        return next(new BaseException(400, err instanceof Error ? err.message : 'Archivo inválido', 'ARCHIVO_INVALIDO'));
    });
};

/**
 * Valida el CONTENIDO del archivo (magic bytes), no el mimetype que declara el cliente. Lo que
 * no sea de un tipo permitido se rechaza; el mimetype y la extensión guardados salen del
 * contenido real. Sin esto un .html o un ejecutable con "Content-Type: image/png" entraba.
 */
export const validarContenidoArchivo: RequestHandler = (req, _res, next) => {
    const file = (req as any).file;
    if (!file) return next();
    const tipo = detectarTipoArchivo(file.buffer, file.mimetype);
    if (!tipo) {
        return next(new BaseException(
            400,
            'El contenido del archivo no corresponde a un tipo permitido (imágenes, PDF, Word, Excel, texto o CSV).',
            'ARCHIVO_INVALIDO',
        ));
    }
    file.mimetype = tipo.mime;
    file.extension = tipo.ext;
    next();
};

// Subida de un archivo (campo "file"): multer + validación de contenido, en ese orden.
export const uploadSingle: RequestHandler[] = [conContexto(conErroresLimpios), validarContenidoArchivo];

// Logo de marca para los PDF. pdfkit sólo sabe embeber PNG y JPEG, así que el
// filtro es más estricto que el genérico (nada de webp/gif/heic) y el tope es
// chico: un logo no pesa megas.
const LOGO_MIME = new Set(['image/png', 'image/jpeg']);
const LOGO_MAX_BYTES = 3 * 1024 * 1024; // 3 MB

export const uploadLogo = conContexto(multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: LOGO_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
        if (LOGO_MIME.has(file.mimetype)) cb(null, true);
        else cb(new Error('El logo debe ser PNG o JPG'));
    },
}).single('file'));

// Detecta el tipo REAL de imagen por magic-bytes (no por el mimetype declarado
// por el cliente, que es falsificable). Sirve para no confiar en el header y
// para derivar una extensión segura en el server (nunca del originalname).
export function sniffImageType(buf: Buffer): 'png' | 'jpeg' | null {
    if (!buf || buf.length < 4) return null;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buf.length >= 8 &&
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
        buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
        return 'png';
    }
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        return 'jpeg';
    }
    return null;
}
