import { z } from 'zod';

/**
 * Links a comprobantes (gastos, extras de venta, items de postventa, facturas del SaaS).
 *
 * El front los pinta como `<a href>`. Con `z.string()` libre entraba cualquier cosa:
 * `javascript:` (hoy lo frenan React 19 y la CSP, pero no tiene por qué llegar a la base),
 * `data:`, o un link a un sitio externo cualquiera con cara de comprobante para un phishing
 * interno. Se aceptan sólo dos formas:
 *  - un enlace https absoluto (el comprobante en Drive, en el sitio del proveedor, etc.), o
 *  - un archivo subido al sistema: ruta relativa `/uploads/…`, sin `..` ni query string
 *    (las URLs firmadas se arman al leer; la que se guarda es la ruta pelada).
 */
const RUTA_UPLOADS = /^\/uploads\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

export function esUrlDeComprobanteValida(valor: string): boolean {
    if (valor.startsWith('/')) {
        return RUTA_UPLOADS.test(valor) && !valor.split('/').some((seg) => seg === '..' || seg === '.');
    }
    try {
        const u = new URL(valor);
        return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password;
    } catch {
        return false;
    }
}

const MENSAJE = 'El comprobante tiene que ser un enlace https:// o un archivo subido al sistema';

const base = () => z.string().trim().max(2048, 'El enlace es demasiado largo').refine(esUrlDeComprobanteValida, MENSAJE);

/** Opcional: '' cuenta como ausente (el form manda el campo vacío). */
export const urlComprobanteOpcional = () =>
    z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), base().optional());

/** Opcional y anulable: null limpia el campo en un update; '' cuenta como ausente. */
export const urlComprobanteAnulable = () =>
    z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), base().nullable().optional());
