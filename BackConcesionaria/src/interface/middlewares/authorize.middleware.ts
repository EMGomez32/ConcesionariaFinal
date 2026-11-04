import { Request, Response, NextFunction } from 'express';
import { context } from '../../infrastructure/security/context';
import { ForbiddenException } from '../../domain/exceptions/BaseException';
import logger from '../../utils/logger';
import { recordSecurityEvent } from '../../infrastructure/security/securityEvents';
import { VentanaDeUso } from '../../infrastructure/security/ventanaDeuso';
import { textoParaLog, urlParaLog } from './requestLogger.middleware';

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

/**
 * Rastro de las denegaciones en security_events (antes sólo iban a logger.warn, que rota en
 * días). Sin inundar la tabla:
 *  - una fila por usuario + método + RUTA (el patrón `/api/usuarios/:id`, no la URL con ids)
 *    cada 10 minutos: un botón que el front muestra de más deja una fila, no mil;
 *  - y una fila `authorize_denied_burst` cuando un mismo usuario junta 30 denegaciones en la
 *    ventana: eso ya no es un botón de más, es alguien probando qué le deja hacer la API.
 * Memoria acotada (VentanaDeUso tiene tope de claves); al reiniciar el proceso se pierde la
 * deduplicación, que es aceptable para un rastro.
 */
const VENTANA_DENEGACIONES_MS = 10 * 60 * 1000;
const UMBRAL_RAFAGA = 30;
const denegacionesPorRuta = new VentanaDeUso(VENTANA_DENEGACIONES_MS);
const denegacionesPorUsuario = new VentanaDeUso(VENTANA_DENEGACIONES_MS);

function registrarDenegacion(req: Request, user: { userId: number; concesionariaId?: number | null; roles: string[] }, requeridos: string[]): void {
    const ruta = `${req.baseUrl}${req.route?.path ?? '/*'}`;
    const base = {
        entidad: 'Ruta',
        usuarioId: user.userId,
        concesionariaId: user.concesionariaId ?? null,
        ip: context.getIp() ?? null,
        userAgent: context.getUserAgent() ?? null,
    };
    if (denegacionesPorRuta.registrar(`${user.userId}:${req.method}:${ruta}`) === 1) {
        void recordSecurityEvent({
            ...base,
            accion: 'authorize_denied',
            detalle: `${req.method} ${ruta} requiere [${requeridos.join(', ')}]; el usuario tiene [${user.roles.join(', ') || 'sin roles'}]`,
        });
    }
    if (denegacionesPorUsuario.registrar(String(user.userId)) === UMBRAL_RAFAGA) {
        void recordSecurityEvent({
            ...base,
            accion: 'authorize_denied_burst',
            detalle: `${UMBRAL_RAFAGA} accesos denegados en ${VENTANA_DENEGACIONES_MS / 60000} minutos (último: ${req.method} ${ruta})`,
        });
    }
}

export const authorize = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = context.getUser();
        if (!user) {
            // Sin contexto de usuario no hay a quién autorizar. Llegar acá significa
            // que la ruta se montó sin `authenticate` delante: es un bug de montaje,
            // no algo que el usuario pueda resolver.
            logger.warn(`authorize sin contexto de usuario: ${textoParaLog(req.method)} ${urlParaLog(req.originalUrl)} (requería ${roles.join(', ')})`);
            throw new ForbiddenException(MENSAJE_DENEGADO);
        }

        const hasRole = roles.some(role => user.roles.includes(role));
        // super_admin bypasses all role requirements.
        if (!hasRole && !user.roles.includes('super_admin')) {
            logger.warn(
                `acceso denegado por rol: usuario ${user.userId} [${user.roles.join(', ') || 'sin roles'}] ` +
                `intentó ${textoParaLog(req.method)} ${urlParaLog(req.originalUrl)}, que requiere ${roles.join(', ')}`
            );
            registrarDenegacion(req, user, roles);
            throw new ForbiddenException(MENSAJE_DENEGADO);
        }
        next();
    };
};
