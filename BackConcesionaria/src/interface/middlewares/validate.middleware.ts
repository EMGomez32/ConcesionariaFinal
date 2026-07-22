import { RequestHandler } from 'express';
import { ZodType } from 'zod';
import { ValidationException } from '../../domain/exceptions/BaseException';

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
 * `details` por campo y un `message` legible que el front ya sabe mostrar).
 */
export const validateBody = (schema: ZodType): RequestHandler => (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        const details = result.error.issues.map((issue) => ({
            campo: issue.path.join('.') || '(body)',
            mensaje: issue.message,
        }));
        const message = details.map((d) => `${d.campo}: ${d.mensaje}`).join('; ');
        return next(new ValidationException(details, message));
    }
    req.body = result.data;
    next();
};
