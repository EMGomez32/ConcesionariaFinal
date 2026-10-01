import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { BaseException, ForbiddenException, NotFoundException } from '../../domain/exceptions/BaseException';
import { JwtTokenService } from '../../infrastructure/security/JwtTokenService';
import { PrismaRefreshTokenRepository } from '../../infrastructure/database/repositories/PrismaRefreshTokenRepository';
import { withAuthBypass } from '../../infrastructure/database/unitOfWork';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
import { exigeMfa } from '../../infrastructure/security/mfaPolicy';
import {
    confirmarSetupMfa, desactivarMfa, estadoMfa, iniciarSetupMfa, regenerarCodigosMfa, verificarSegundoFactor,
} from '../../application/services/mfaService';
import { emitirSesion } from '../../application/use-cases/auth/emitirSesion';
import { RevokeUserSessions } from '../../application/use-cases/auth/RevokeUserSessions';

const tokenService = new JwtTokenService();
const refreshRepo = new PrismaRefreshTokenRepository();
const revokeSessions = new RevokeUserSessions(tokenService, refreshRepo);

const usuarioActual = () => {
    const u = context.getUser();
    if (!u) throw new BaseException(401, 'Sesión no válida', 'UNAUTHORIZED');
    return u;
};

/** Datos del usuario (con roles) para decidir y para emitir sesión nueva. */
async function cargarConRoles(id: number) {
    const u = await withAuthBypass((tx) => tx.usuario.findFirst({
        where: { id, deletedAt: null },
        include: { roles: { include: { rol: true } } },
    }));
    if (!u) throw new NotFoundException('Usuario');
    return u;
}

/** Re-autenticación: las acciones sensibles del 2FA piden la contraseña ACTUAL (no basta una sesión abierta). */
async function exigirContrasena(id: number, password: string) {
    const u = await cargarConRoles(id);
    const ok = !!u.passwordHash && (await bcrypt.compare(password ?? '', u.passwordHash));
    if (!ok) throw new BaseException(400, 'La contraseña actual es incorrecta', 'INVALID_CURRENT_PASSWORD');
    return u;
}

const rolesDe = (u: { roles: Array<{ deletedAt: Date | null; rol: { nombre: string; deletedAt: Date | null } }> }) =>
    u.roles.filter((r) => !r.deletedAt && !r.rol.deletedAt).map((r) => r.rol.nombre);

export class MfaController {
    // GET /auth/2fa/status
    static async status(_req: Request, res: Response, next: NextFunction) {
        try {
            const sesion = usuarioActual();
            const e = await estadoMfa(sesion.userId);
            res.json({ ...e, obligatorio: exigeMfa(sesion.roles) });
        } catch (error) { next(error); }
    }

    // POST /auth/2fa/setup { password } → secreto + URI para el QR (todavía NO activa nada)
    static async setup(req: Request, res: Response, next: NextFunction) {
        try {
            const sesion = usuarioActual();
            await exigirContrasena(sesion.userId, req.body.password);
            const s = await iniciarSetupMfa(sesion.userId);
            res.json({ secreto: s.secreto, otpauthUrl: s.otpauthUrl });
        } catch (error) { next(error); }
    }

    // POST /auth/2fa/enable { code } → activa, devuelve los códigos de recuperación (UNA vez) y una sesión nueva
    static async enable(req: Request, res: Response, next: NextFunction) {
        try {
            const sesion = usuarioActual();
            const codigosRecuperacion = await confirmarSetupMfa(sesion.userId, req.body.code);

            // Las sesiones abiertas antes de activar el 2FA se cierran (se entró sin segundo factor) y se
            // emite una nueva: así tampoco queda la marca `mfaPending` de una cuenta que lo tenía que activar.
            await revokeSessions.execute(sesion.userId);
            const u = await cargarConRoles(sesion.userId);
            const nueva = await emitirSesion(u, tokenService, refreshRepo);

            await audit({
                entidad: 'Usuario',
                accion: 'update',
                entidadId: sesion.userId,
                usuarioId: sesion.userId,
                concesionariaId: u.concesionariaId,
                detalle: '2FA activado (sesiones anteriores cerradas)',
            });
            res.json({ codigosRecuperacion, ...nueva });
        } catch (error) { next(error); }
    }

    // POST /auth/2fa/disable { password, code | recoveryCode }
    static async disable(req: Request, res: Response, next: NextFunction) {
        try {
            const sesion = usuarioActual();
            const u = await exigirContrasena(sesion.userId, req.body.password);
            // Si el rol lo exige, no se puede apagar (la cuenta quedaría bloqueada en "configurar 2FA").
            if (exigeMfa(rolesDe(u))) {
                throw new ForbiddenException('Tu rol exige 2FA: no se puede desactivar.');
            }
            const r = await verificarSegundoFactor(sesion.userId, { codigo: req.body.code, recuperacion: req.body.recoveryCode });
            if (!r.ok) throw new BaseException(400, 'El código es incorrecto o venció.', 'MFA_CODIGO_INVALIDO');

            await desactivarMfa(sesion.userId);
            await audit({
                entidad: 'Usuario', accion: 'update', entidadId: sesion.userId, usuarioId: sesion.userId,
                concesionariaId: u.concesionariaId, detalle: '2FA desactivado por el propio usuario',
            });
            res.status(204).send();
        } catch (error) { next(error); }
    }

    // POST /auth/2fa/recovery-codes { password, code } → códigos nuevos (los anteriores dejan de valer)
    static async regenerarCodigos(req: Request, res: Response, next: NextFunction) {
        try {
            const sesion = usuarioActual();
            const u = await exigirContrasena(sesion.userId, req.body.password);
            const r = await verificarSegundoFactor(sesion.userId, { codigo: req.body.code });
            if (!r.ok) throw new BaseException(400, 'El código es incorrecto o venció.', 'MFA_CODIGO_INVALIDO');
            const codigosRecuperacion = await regenerarCodigosMfa(sesion.userId);
            await audit({
                entidad: 'Usuario', accion: 'update', entidadId: sesion.userId, usuarioId: sesion.userId,
                concesionariaId: u.concesionariaId, detalle: 'Códigos de recuperación del 2FA regenerados',
            });
            res.json({ codigosRecuperacion });
        } catch (error) { next(error); }
    }

    // POST /usuarios/:id/2fa/reset (admin del tenant o super_admin): el usuario perdió el dispositivo
    static async resetDeOtro(req: Request, res: Response, next: NextFunction) {
        try {
            const actor = usuarioActual();
            const id = parseInt(req.params.id as string, 10);
            const esSuper = actor.roles.includes('super_admin');
            const objetivo = await cargarConRoles(id);
            // Un admin sólo opera sobre usuarios de SU concesionaria (404, no 403: no se revela que existe).
            if (!esSuper && objetivo.concesionariaId !== actor.concesionariaId) throw new NotFoundException('Usuario');
            // Y nunca sobre un super_admin: quitarle el 2FA a la cuenta de plataforma es de otro super_admin.
            if (!esSuper && rolesDe(objetivo).includes('super_admin')) {
                throw new ForbiddenException('Sólo un super_admin puede resetear el 2FA de otro super_admin.');
            }

            await desactivarMfa(id);
            await revokeSessions.execute(id);
            await audit({
                entidad: 'Usuario', accion: 'update', entidadId: id,
                detalle: `2FA reseteado por un administrador (usuario ${id}); sesiones cerradas`,
                concesionariaId: objetivo.concesionariaId,
            });
            res.status(204).send();
        } catch (error) { next(error); }
    }
}
