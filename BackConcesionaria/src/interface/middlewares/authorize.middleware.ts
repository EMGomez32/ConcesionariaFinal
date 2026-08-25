import { Request, Response, NextFunction } from 'express';
import { context } from '../../infrastructure/security/context';
import { ForbiddenException } from '../../domain/exceptions/BaseException';
import logger from '../../utils/logger';

/**
 * El mensaje que ve el usuario final. Es a propósito genérico y en español:
 *
 * 1. `err.message` viaja tal cual al body (error.middleware.ts) y varias pantallas
 *    lo pintan crudo en un toast. Un cartel que diga "Access denied. Required
 *    roles: admin" en una UI en español es soporte telefónico garantizado.
 * 2. La lista de roles requeridos es información de la implementación: no le sirve
 *    a quien la lee y le dice a un curioso qué perfil tiene que conseguir. Va al
 *    log con el correlationId, no al body.
 *
 * Si el usuario ve esto seguido, el bug está en el FRONT: la pantalla le está
 * mostrando un control que su rol no puede usar (ver `usePermisos` en el front).
 */
const MENSAJE_DENEGADO =
    'No tenés permiso para esta operación. Consultalo con el administrador de la concesionaria.';

export const authorize = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = context.getUser();
        if (!user) {
            // Sin contexto de usuario no hay a quién autorizar. Llegar acá significa
            // que la ruta se montó sin `authenticate` delante: es un bug de montaje,
            // no algo que el usuario pueda resolver.
            logger.warn(`authorize sin contexto de usuario: ${req.method} ${req.originalUrl} (requería ${roles.join(', ')})`);
            throw new ForbiddenException(MENSAJE_DENEGADO);
        }

        const hasRole = roles.some(role => user.roles.includes(role));
        // super_admin bypasses all role requirements.
        if (!hasRole && !user.roles.includes('super_admin')) {
            logger.warn(
                `acceso denegado por rol: usuario ${user.userId} [${user.roles.join(', ') || 'sin roles'}] ` +
                `intentó ${req.method} ${req.originalUrl}, que requiere ${roles.join(', ')}`
            );
            throw new ForbiddenException(MENSAJE_DENEGADO);
        }
        next();
    };
};
