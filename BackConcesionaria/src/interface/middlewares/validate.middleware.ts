import { RequestHandler } from 'express';
import { ZodType } from 'zod';
import { ValidationException } from '../../domain/exceptions/BaseException';
import { mapaDeErrores } from '../validation/mensajes';

/**
 * Valida `req.body` contra un schema de Zod. Estándar go-forward de validación
 * (reemplaza al patrón de express-validator, que no recorta claves y obliga a
 * un `pickEditable` manual en cada repo).
 *
 * Si pasa: REEMPLAZA `req.body` por el objeto parseado. Zod descarta las claves
 * desconocidas por defecto → el use-case recibe datos limpios y tipados, y se
 * corta el mass-assignment (nadie puede colar `concesionariaId`, `id`, etc.).
 *
 * Si falla: delega en el error handler con una `ValidationException` (400 con
 * `details` por campo y un `message` legible que el front ya sabe mostrar). Los
 * mensajes salen en español con la etiqueta del campo (ver validation/mensajes.ts).
 */
export const validateBody = (schema: ZodType): RequestHandler => (req, _res, next) => {
    const result = schema.safeParse(req.body, { error: mapaDeErrores });
    if (!result.success) return next(errorDeValidacion(result.error.issues));
    req.body = result.data;
    next();
};

/**
 * Arma la ValidationException de una lista de issues de Zod, con la forma de
 * siempre: `details: [{ campo, mensaje }]` y `message` con los mensajes unidos por
 * "; ". `campo` es el path técnico (para que el front marque el input); el
 * `message` NO lo lleva: el usuario veía "sucursalId: …". Los mensajes repetidos
 * (el mismo error en varios ítems de una lista) se muestran una sola vez.
 *
 * `prefijo`: path del objeto validado dentro del body (p.ej. 'config').
 */
export function errorDeValidacion(
    issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
    prefijo: PropertyKey[] = [],
): ValidationException {
    const details = issues.map((issue) => ({
        campo: [...prefijo, ...issue.path].map(String).join('.') || '(body)',
        mensaje: issue.message,
    }));
    const message = [...new Set(details.map((d) => d.mensaje))].join('; ');
    return new ValidationException(details, message);
}
