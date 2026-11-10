import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { JwtTokenService } from '../../infrastructure/security/JwtTokenService';
import { PrismaRefreshTokenRepository } from '../../infrastructure/database/repositories/PrismaRefreshTokenRepository';
import { Login } from '../../application/use-cases/auth/Login';
import { RefreshAuth } from '../../application/use-cases/auth/RefreshAuth';
import { LogoutAuth } from '../../application/use-cases/auth/Logout';
import { LoginSegundoFactor } from '../../application/use-cases/auth/LoginSegundoFactor';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
import { rawPrisma } from '../../infrastructure/database/prisma';
import { withAuthBypass } from '../../infrastructure/database/unitOfWork';
import { sendPasswordResetEmail } from '../../infrastructure/email/mailer';
import { env } from '../../config/env';
import { logger } from '../../infrastructure/logging/logger';
import { ponerCookieRefresh, limpiarCookieRefresh, refreshDeLaRequest, refreshParaElCuerpo, sinRefresh } from './refreshCookie';
import { recordSecurityEvent } from '../../infrastructure/security/securityEvents';
import { notificarAlertaSeguridad } from '../../infrastructure/security/alertasSeguridad';

const tokenService = new JwtTokenService();
const refreshRepo = new PrismaRefreshTokenRepository();
const loginUC = new Login(tokenService, refreshRepo);
const refreshUC = new RefreshAuth(tokenService, refreshRepo);
const logoutUC = new LogoutAuth(tokenService, refreshRepo);
const loginSegundoFactorUC = new LoginSegundoFactor(tokenService, refreshRepo);

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Login de la cuenta de PLATAFORMA (super_admin): saltea el aislamiento entre concesionarias,
 * así que cada ingreso queda en security_events (sin tenant: audit_log no lo puede guardar
 * si la cuenta no tiene concesionaria) y sale como alerta si hay webhook. Un login que el
 * dueño no reconoce es la señal más temprana de una cuenta tomada.
 */
async function rastroLoginSuperAdmin(
    user: { id: number; email: string; roles?: string[]; concesionariaId?: number | null; mfaPendiente?: boolean },
    con2fa: boolean,
): Promise<void> {
    if (!user.roles?.includes('super_admin')) return;
    const detalle = con2fa ? 'Login de super_admin con 2FA' : user.mfaPendiente ? 'Login de super_admin (falta configurar el 2FA)' : 'Login de super_admin sin 2FA';
    await recordSecurityEvent({
        accion: 'login_super_admin',
        entidad: 'Usuario',
        entidadId: user.id,
        usuarioId: user.id,
        concesionariaId: user.concesionariaId ?? null,
        email: user.email,
        detalle,
        ip: context.getIp() ?? null,
        userAgent: context.getUserAgent() ?? null,
    });
    notificarAlertaSeguridad({ tipo: 'super_admin_login', usuarioId: user.id, email: user.email, detalle });
}
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hora

export class AuthController {
    static async login(req: Request, res: Response, next: NextFunction) {
        try {
            const { email, password } = req.body;
            const result = await loginUC.execute(email, password);

            // Cuenta con 2FA: todavía NO hay sesión. Se devuelve el token de 5 min para /auth/login/2fa.
            if ('requires2fa' in result) {
                return res.json(result);
            }

            // Login is unauthenticated, so the context middleware did not pre-fill
            // user info. Pass usuarioId/concesionariaId explicitly.
            if (result.user.concesionariaId) {
                await audit({
                    entidad: 'Usuario',
                    accion: 'login',
                    entidadId: result.user.id,
                    detalle: `Login ${result.user.email}`,
                    usuarioId: result.user.id,
                    concesionariaId: result.user.concesionariaId,
                });
            }

            await rastroLoginSuperAdmin(result.user, false);

            // El refresh va siempre en la cookie httpOnly (web). En el cuerpo, sólo para los
            // clientes que lo guardan ellos (app móvil): la web (X-Autenza-Cliente: web) recibe
            // únicamente el access. Ver refreshParaElCuerpo.
            ponerCookieRefresh(res, result.tokens.refresh);
            res.json(refreshParaElCuerpo(req) ? result : { ...result, tokens: sinRefresh(result.tokens) });
        } catch (error) {
            next(error);
        }
    }

    // POST /auth/login/2fa { mfaToken, code | recoveryCode } → sesión
    static async login2fa(req: Request, res: Response, next: NextFunction) {
        try {
            const { mfaToken, code, recoveryCode } = req.body;
            const result = await loginSegundoFactorUC.execute(mfaToken, { codigo: code, recuperacion: recoveryCode });
            const { usoRecuperacion, ...sesion } = result;

            if (sesion.user.concesionariaId) {
                await audit({
                    entidad: 'Usuario',
                    accion: 'login',
                    entidadId: sesion.user.id,
                    detalle: `Login ${sesion.user.email} (2FA)${usoRecuperacion ? ' con código de recuperación' : ''}`,
                    usuarioId: sesion.user.id,
                    concesionariaId: sesion.user.concesionariaId,
                });
            }
            await rastroLoginSuperAdmin(sesion.user, true);
            ponerCookieRefresh(res, sesion.tokens.refresh);
            const tokens = refreshParaElCuerpo(req) ? sesion.tokens : sinRefresh(sesion.tokens);
            res.json({ ...sesion, tokens, ...(usoRecuperacion ? { usoRecuperacion: true } : {}) });
        } catch (error) {
            next(error);
        }
    }

    static async refresh(req: Request, res: Response, next: NextFunction) {
        try {
            // body.refreshToken (app móvil) o, si no viene, la cookie (web). Sin
            // ninguno, RefreshAuth responde el mismo 401 que a un token inválido.
            const result = await refreshUC.execute(refreshDeLaRequest(req) ?? '');
            // Rotación: la cookie pasa a tener el refresh nuevo. Si falla NO se borra:
            // con dos pestañas, el 401 del que pierde la carrera borraría la cookie que
            // el ganador acaba de rotar (ni siquiera con SESION_MAXIMA_VENCIDA: la cookie
            // ya no sirve y vence sola).
            ponerCookieRefresh(res, result.refresh);
            // El refresh nuevo vuelve en el cuerpo sólo a quien lo mandó en el cuerpo (app
            // móvil). Al que renovó con la cookie (navegador) le basta la cookie rotada.
            res.json(refreshParaElCuerpo(req, { exigirQueVengaEnElCuerpo: true }) ? result : sinRefresh(result));
        } catch (error) {
            next(error);
        }
    }

    // POST /auth/forgot-password { email }
    // Genera un token de un solo uso y lo envía por email (o lo loguea si no hay
    // SMTP). Responde siempre 200 para no revelar si el email existe.
    static async forgotPassword(req: Request, res: Response, next: NextFunction) {
        try {
            const email = String(req.body?.email || '').trim().toLowerCase();
            const respuestaGenerica = { message: 'Si el email está registrado, te enviamos instrucciones para restablecer la contraseña.' };

            if (!email) return res.json(respuestaGenerica);

            // Flujo sin autenticación ni tenant: withAuthBypass saltea la RLS (bajo
            // app_rw filtraría `usuarios` a 0 filas y nunca encontraría al usuario).
            // email es @unique global → a lo sumo 1 fila; orderBy determinístico como
            // defensa en profundidad (que el reset nunca le llegue a un homónimo).
            const usuario = await withAuthBypass((tx) => tx.usuario.findFirst({ where: { email, activo: true, deletedAt: null }, orderBy: { id: 'asc' } }));
            if (!usuario) return res.json(respuestaGenerica);

            const token = crypto.randomBytes(32).toString('hex');
            // Un solo enlace vigente por usuario: pedir uno nuevo invalida los
            // anteriores todavía sin usar (si no, cada pedido dejaba otro enlace
            // válido dando vueltas en mails viejos durante 1 h).
            await rawPrisma.passwordResetToken.updateMany({
                where: { usuarioId: usuario.id, usedAt: null },
                data: { usedAt: new Date() },
            });
            await rawPrisma.passwordResetToken.create({
                data: {
                    usuarioId: usuario.id,
                    tokenHash: sha256(token),
                    expiresAt: new Date(Date.now() + RESET_TTL_MS),
                },
            });

            const link = `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${token}`;
            // Sin await: esperar al SMTP hacía que un email registrado tardara cientos de ms
            // más que uno inexistente (oráculo de existencia por tiempo de respuesta), y un
            // fallo del proveedor devolvía 500 sólo para cuentas reales. Se envía aparte y un
            // error se loguea.
            sendPasswordResetEmail(usuario.email, link).catch((err) =>
                logger.error(`[auth] no se pudo enviar el email de recuperación: ${err instanceof Error ? err.message : err}`));

            return res.json(respuestaGenerica);
        } catch (error) {
            next(error);
        }
    }

    // POST /auth/reset-password { token, password }
    static async resetPassword(req: Request, res: Response, next: NextFunction) {
        try {
            // token y password ya vienen validados por validateBody(resetPasswordSchema)
            // en la ruta (presencia + longitud mínima 10).
            const { token, password } = req.body;

            const registro = await rawPrisma.passwordResetToken.findFirst({
                where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } },
            });
            if (!registro) {
                return res.status(400).json({ error: 'INVALID_TOKEN', message: 'El enlace es inválido o expiró. Solicitá uno nuevo.' });
            }

            const passwordHash = await bcrypt.hash(String(password), 10);
            // withAuthBypass: transacción única (atómica) con la RLS salteada — el
            // update de `usuarios` es cross-tenant (reset sin sesión) y bajo app_rw la
            // RLS lo filtraría a 0 filas (la contraseña no cambiaría).
            const usado = await withAuthBypass(async (tx) => {
                // Un solo uso, ATÓMICO: el findFirst de arriba no alcanza (dos requests
                // con el mismo token pasaban los dos). Sólo gana quien logra pasar
                // usedAt de NULL a fecha; el perdedor no cambia nada.
                const claim = await tx.passwordResetToken.updateMany({
                    where: { id: registro.id, usedAt: null },
                    data: { usedAt: new Date() },
                });
                if (claim.count !== 1) return false;
                await tx.usuario.update({ where: { id: registro.usuarioId }, data: { passwordHash } });
                // Cierra las sesiones activas: hay que volver a loguearse. Se BORRAN
                // (no se marcan revocadas): un refresh viejo que reingrese es un 401 a
                // secas y no dispara la detección de reuso sobre las sesiones NUEVAS.
                await tx.refreshToken.deleteMany({ where: { usuarioId: registro.usuarioId } });
                return true;
            });
            if (!usado) {
                return res.status(400).json({ error: 'INVALID_TOKEN', message: 'El enlace es inválido o expiró. Solicitá uno nuevo.' });
            }

            return res.json({ message: 'Contraseña actualizada. Ya podés iniciar sesión.' });
        } catch (error) {
            next(error);
        }
    }

    static async logout(req: Request, res: Response, next: NextFunction) {
        try {
            // Revoca el refresh token de la sesión (best-effort): a partir de acá ese
            // token deja de servir para renovar, aunque todavía no haya expirado.
            // body.refreshToken (app móvil) o la cookie (web); la cookie se borra siempre.
            await logoutUC.execute(refreshDeLaRequest(req));
            limpiarCookieRefresh(res);

            // Auditar sólo si el access token seguía válido (contextMiddleware pobló
            // el usuario): el audit_log es tenant-scoped y necesita la concesionaria.
            const user = context.getUser();
            if (user?.concesionariaId) {
                await audit({
                    entidad: 'Usuario',
                    accion: 'logout',
                    entidadId: user.userId,
                    detalle: `Logout usuario ${user.userId}`,
                });
            }
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
