import crypto from 'crypto';
import { Request, RequestHandler, Response } from 'express';
import { audit } from '../../infrastructure/security/audit';
import { hashEmail, recordSecurityEvent } from '../../infrastructure/security/securityEvents';
import { DetectorFuerzaBruta, VentanaDeUso } from '../../infrastructure/security/ventanaDeuso';
import { withAuthBypass } from '../../infrastructure/database/unitOfWork';
import { rawPrisma } from '../../infrastructure/database/prisma';
import { logger } from '../../infrastructure/logging/logger';
import { getClientIp } from '../../utils/clientIp';

/**
 * Rastro de los flujos de autenticación SIN sesión: login fallido, recuperación de
 * contraseña. Se monta sobre /auth y observa la respuesta cuando termina
 * (`res.on('finish')`), así no toca los controllers ni cambia lo que ve el cliente:
 * el motivo del fallo (email inexistente vs. clave incorrecta) queda SÓLO en el
 * rastro, nunca en la respuesta HTTP.
 *
 *  - login fallido contra una cuenta que existe → audit_log de SU concesionaria
 *    (lo ve el admin); contra un email que no existe → security_events (sin tenant).
 *  - bloqueo por rate limit del login → security_events (una vez por cuenta/IP y ventana).
 *  - racha de fallos → ALERTA (log nivel error + security_events 'brute_force_alert').
 *  - pedido y cierre de recuperación de contraseña → audit_log del usuario.
 */

export type EventoAuth = 'login_fail' | 'login_bloqueado' | 'reset_pedido' | 'reset_hecho' | null;

/** Qué evento corresponde a (ruta relativa a /auth, status HTTP). Pura: se testea sola. */
export function clasificar(path: string, status: number): EventoAuth {
    // Segundo factor incorrecto: cuenta como login fallido (y lo ve el admin del tenant).
    if (path === '/login/2fa' && (status === 401 || status === 400)) return 'login_fail';
    if (path === '/login') {
        if (status === 401 || status === 403) return 'login_fail';
        if (status === 429) return 'login_bloqueado';
    }
    if (path === '/forgot-password' && status === 200) return 'reset_pedido';
    if (path === '/reset-password' && status === 200) return 'reset_hecho';
    return null;
}

const detector = new DetectorFuerzaBruta();
// Un 429 se registra una vez por clave y ventana (si no, un atacante llena la tabla).
const bloqueosVistos = new VentanaDeUso(15 * 60 * 1000);

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const normalizar = (e: unknown): string => String(e ?? '').trim().toLowerCase();

async function buscarUsuario(email: string) {
    if (!email) return null;
    return withAuthBypass((tx) =>
        tx.usuario.findFirst({
            where: { email, deletedAt: null },
            orderBy: { id: 'asc' },
            select: { id: true, concesionariaId: true },
        }),
    );
}

interface Origen { ip: string | null; userAgent: string | null }

async function loginFallido(email: string, status: number, o: Origen): Promise<void> {
    const usuario = await buscarUsuario(email);
    const motivo = status === 403 ? 'usuario inactivo' : usuario ? 'contraseña incorrecta' : 'usuario inexistente';
    if (usuario?.concesionariaId) {
        await audit({
            entidad: 'Usuario',
            entidadId: usuario.id,
            accion: 'login_fail',
            detalle: `Login fallido (${motivo})`,
            usuarioId: usuario.id,
            concesionariaId: usuario.concesionariaId,
            ip: o.ip,
            userAgent: o.userAgent,
        });
    } else {
        await recordSecurityEvent({
            accion: 'login_fail',
            entidad: 'Usuario',
            entidadId: usuario?.id ?? null,
            usuarioId: usuario?.id ?? null,
            email,
            detalle: `Login fallido (${motivo})`,
            ...o,
        });
    }

    const cruzados = detector.fallo(email ? hashEmail(email) : null, o.ip);
    for (const que of cruzados) {
        logger.error(`[security] posible fuerza bruta: ${que === 'cuenta' ? 'varios fallos contra una misma cuenta' : 'varios fallos desde una misma IP'}`, {
            ip: o.ip,
            emailHash: email ? hashEmail(email) : null,
        });
        await recordSecurityEvent({
            accion: 'brute_force_alert',
            usuarioId: usuario?.id ?? null,
            concesionariaId: usuario?.concesionariaId ?? null,
            email: que === 'cuenta' ? email : null,
            detalle: que === 'cuenta' ? 'Racha de logins fallidos contra una misma cuenta' : 'Racha de logins fallidos desde una misma IP',
            ...o,
        });
    }
}

async function loginBloqueado(email: string, o: Origen): Promise<void> {
    const clave = `${o.ip ?? '?'}:${email ? hashEmail(email) : ''}`;
    if (bloqueosVistos.registrar(clave) > 1) return;
    await recordSecurityEvent({
        accion: 'login_bloqueado',
        email: email || null,
        detalle: 'Login bloqueado por límite de intentos',
        ...o,
    });
}

async function resetPedido(email: string, o: Origen): Promise<void> {
    const usuario = await buscarUsuario(email);
    if (!usuario) return; // Un email desconocido no deja rastro: ya lo frena el rate limit y no aporta.
    if (usuario.concesionariaId) {
        await audit({
            entidad: 'Usuario',
            entidadId: usuario.id,
            accion: 'password_reset_request',
            detalle: 'Pedido de recuperación de contraseña',
            usuarioId: usuario.id,
            concesionariaId: usuario.concesionariaId,
            ip: o.ip,
            userAgent: o.userAgent,
        });
    } else {
        await recordSecurityEvent({
            accion: 'password_reset_request',
            entidad: 'Usuario',
            entidadId: usuario.id,
            usuarioId: usuario.id,
            detalle: 'Pedido de recuperación de contraseña',
            ...o,
        });
    }
}

async function resetHecho(token: string, o: Origen): Promise<void> {
    if (!token) return;
    // El controller ya marcó el token como usado: se lo ubica por su hash.
    const registro = await rawPrisma.passwordResetToken.findFirst({
        where: { tokenHash: sha256(token) },
        select: { usuarioId: true },
    });
    if (!registro) return;
    const usuario = await withAuthBypass((tx) =>
        tx.usuario.findFirst({ where: { id: registro.usuarioId }, select: { id: true, concesionariaId: true } }),
    );
    if (!usuario) return;
    if (usuario.concesionariaId) {
        await audit({
            entidad: 'Usuario',
            entidadId: usuario.id,
            accion: 'password_reset_done',
            detalle: 'Contraseña restablecida con el enlace de recuperación (sesiones cerradas)',
            usuarioId: usuario.id,
            concesionariaId: usuario.concesionariaId,
            ip: o.ip,
            userAgent: o.userAgent,
        });
    } else {
        await recordSecurityEvent({
            accion: 'password_reset_done',
            entidad: 'Usuario',
            entidadId: usuario.id,
            usuarioId: usuario.id,
            detalle: 'Contraseña restablecida con el enlace de recuperación (sesiones cerradas)',
            ...o,
        });
    }
}

async function registrar(evento: EventoAuth, req: Request, res: Response): Promise<void> {
    if (!evento) return;
    const o: Origen = {
        ip: getClientIp(req) ?? null,
        userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    };
    switch (evento) {
        case 'login_fail':
            return loginFallido(normalizar(req.body?.email), res.statusCode, o);
        case 'login_bloqueado':
            return loginBloqueado(normalizar(req.body?.email), o);
        case 'reset_pedido':
            return resetPedido(normalizar(req.body?.email), o);
        case 'reset_hecho':
            return resetHecho(String(req.body?.token ?? ''), o);
    }
}

export const authEvents: RequestHandler = (req, res, next) => {
    // Ruta relativa a /auth, capturada AHORA: cuando la respuesta termina, el router
    // ya pudo restaurar req.url y `req.path` dejaría de ser '/login'.
    const path = req.path;
    res.on('finish', () => {
        registrar(clasificar(path, res.statusCode), req, res).catch((err) =>
            logger.error('[security] no se pudo registrar el evento de autenticación', { err }),
        );
    });
    next();
};
