import express, { RequestHandler, Response, Router } from 'express';
import path from 'path';
import { verificarRutaFirmada } from '../../infrastructure/security/urlFirmada';
import { esRutaPrivada, rutaNormalizada } from '../../infrastructure/storage/zonaPrivada';

/**
 * Servido de /uploads con dos zonas:
 *  - PÚBLICA (fotos de vehículos, logo): las consumen la SPA, los PDF y Mercado Libre (que
 *    baja las fotos de una URL pública), así que siguen abiertas y cacheables.
 *  - PRIVADA (adjuntos de solicitudes `solicitudes-<id>/…` y documentos de vehículos
 *    `vehiculos-docs-<id>/…`: DNI, recibos, títulos, cédulas): sólo con URL FIRMADA y
 *    vigente, que el backend entrega a un usuario autenticado y autorizado. Sin cache.
 * Qué cae en cada zona lo decide `esRutaPrivada` (storage/zonaPrivada.ts).
 */

// Re-export: los tests y otros módulos ya importaban estas funciones desde acá.
export { esRutaPrivada, rutaNormalizada };

/**
 * Cabeceras de toda respuesta de la zona privada (el 403 incluido):
 *  - `private, no-store`: ni Cloudflare, ni un proxy, ni el disco del navegador guardan
 *    un DNI. Con `public, max-age=604800` el borde podía servirlo una semana sin firma.
 *  - `no-referrer`: la URL firmada no se filtra por el Referer si el PDF tiene enlaces.
 */
function cabecerasPrivadas(res: Response): void {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
}

/** Guarda: la zona privada exige firma válida; la pública pasa. */
export const guardaZonaPrivada: RequestHandler = (req, res, next) => {
    const ruta = rutaNormalizada(req.path);
    if (ruta === null) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Ruta inválida' });
        return;
    }
    if (!esRutaPrivada(ruta)) return next();

    cabecerasPrivadas(res);
    if (!verificarRutaFirmada(`/uploads${ruta}`, req.query.exp, req.query.sig)) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'El enlace del archivo no es válido o venció. Volvé a abrirlo desde la pantalla donde lo encontraste.' });
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
                cabecerasPrivadas(res);
            } else {
                res.setHeader('Cache-Control', 'public, max-age=604800');
            }
        },
    }));
    return router;
}
