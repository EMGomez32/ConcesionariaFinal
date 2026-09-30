import multer from 'multer';
import { RequestHandler } from 'express';
import { context } from '../../infrastructure/security/context';

/**
 * Multer lee el cuerpo por eventos del stream de la request, que NO conservan el AsyncLocalStorage
 * (usuario, tenant, correlationId) con el que entró el request. Sin re-entrar al contexto, lo que
 * corre DESPUÉS de la subida ve un tenant vacío y, bajo el rol app_rw, la RLS de Postgres no
 * encuentra ninguna fila: una subida válida daba 404 ('Vehículo no encontrado'). Con superusuario
 * (que saltea la RLS) el bug no se ve, por eso el CI normal no lo detectaba.
 * Se captura el contexto ANTES de multer y se lo re-entra al continuar.
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

export const uploadSingle = conContexto(multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
        else cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    },
}).single('file'));

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
