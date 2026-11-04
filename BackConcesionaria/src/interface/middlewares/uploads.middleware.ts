import express, { RequestHandler, Router } from 'express';
import path from 'path';
import { verificarRutaFirmada } from '../../infrastructure/security/urlFirmada';

/**
 * Servido de /uploads con dos zonas:
 *  - PÚBLICA (fotos de vehículos, logo): las consumen la SPA, los PDF y Mercado Libre (que
 *    baja las fotos de una URL pública), así que siguen abiertas y cacheables.
 *  - PRIVADA (`/solicitudes/…`: DNI, recibos de sueldo): sólo con URL FIRMADA y vigente, que
 *    el backend entrega a un usuario autenticado al listar los adjuntos. Sin cache.
 */

// Prefijos de la zona privada (relativos a /uploads).
const PREFIJOS_PRIVADOS = ['/solicitudes'];

/**
 * Ruta normalizada como la resolvería el filesystem. `express.static` DECODIFICA el path
 * (%73olicitudes → solicitudes) y resuelve `..` y `//`; si el guarda mirara el path CRUDO,
 * `/uploads/%73olicitudes/…` esquivaría el chequeo de prefijo y se serviría sin firma.
 * Devuelve null si el path no se puede decodificar.
 */
export function rutaNormalizada(rawPath: string): string | null {
    try {
        const decodificada = decodeURIComponent(rawPath).replace(/\\/g, '/');
        const n = path.posix.normalize(`/${decodificada}`);
        return n.replace(/\/{2,}/g, '/');
    } catch {
        return null;
    }
}

export function esRutaPrivada(rutaNormalizadaRelativa: string): boolean {
    const r = rutaNormalizadaRelativa.toLowerCase();
    return PREFIJOS_PRIVADOS.some((p) => r === p || r.startsWith(`${p}/`));
}

/** Guarda: la zona privada exige firma válida; la pública pasa. */
export const guardaZonaPrivada: RequestHandler = (req, res, next) => {
    const ruta = rutaNormalizada(req.path);
    if (ruta === null) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Ruta inválida' });
        return;
    }
    if (!esRutaPrivada(ruta)) return next();

    if (!verificarRutaFirmada(`/uploads${ruta}`, req.query.exp, req.query.sig)) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(403).json({ error: 'FORBIDDEN', message: 'El enlace del archivo no es válido o venció. Volvé a abrirlo desde la solicitud.' });
        return;
    }
    next();
};

/** Router listo para montar en /uploads. */
export function crearRouterUploads(uploadsDir: string): Router {
    const router = express.Router();
    router.use(guardaZonaPrivada);
    router.use(express.static(uploadsDir, {
        maxAge: '7d',
        etag: true,
        // Sin dotfiles ni índices de directorio.
        dotfiles: 'ignore',
        index: false,
        setHeaders: (res, filePath) => {
            // Aunque el contenido se valida al subir, /uploads es same-origin con la SPA: un archivo
            // malicioso servido inline sería un XSS/phishing en el dominio confiable. `nosniff` evita que
            // un binario mal etiquetado se interprete como HTML, y la CSP `sandbox` (sin tokens) hace que
            // cualquier HTML/SVG corra en un origen aislado y sin scripts.
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox; frame-ancestors 'none'");
            const rel = path.relative(uploadsDir, filePath).replace(/\\/g, '/');
            if (esRutaPrivada(`/${rel}`)) {
                // Documentos personales: nada de caches compartidos (Cloudflare, proxies, navegador).
                res.setHeader('Cache-Control', 'private, no-store');
            } else {
                res.setHeader('Cache-Control', 'public, max-age=604800');
            }
        },
    }));
    return router;
}
