import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { JwtTokenService } from '../../infrastructure/security/JwtTokenService';
import { PrismaRefreshTokenRepository } from '../../infrastructure/database/repositories/PrismaRefreshTokenRepository';
import { Login } from '../../application/use-cases/auth/Login';
import { RefreshAuth } from '../../application/use-cases/auth/RefreshAuth';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
import { rawPrisma } from '../../infrastructure/database/prisma';
import { sendPasswordResetEmail } from '../../infrastructure/email/mailer';
import { env } from '../../config/env';

const tokenService = new JwtTokenService();
const refreshRepo = new PrismaRefreshTokenRepository();
const loginUC = new Login(tokenService, refreshRepo);
const refreshUC = new RefreshAuth(tokenService, refreshRepo);

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hora

export class AuthController {
    static async login(req: Request, res: Response, next: NextFunction) {
        try {
            const { email, password } = req.body;
            const result = await loginUC.execute(email, password);

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

            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async refresh(req: Request, res: Response, next: NextFunction) {
        try {
            const { refreshToken } = req.body;
            const result = await refreshUC.execute(refreshToken);
            res.json(result);
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

            // rawPrisma: flujo sin autenticación, sin contexto de tenant.
            const usuario = await rawPrisma.usuario.findFirst({ where: { email, activo: true, deletedAt: null } });
            if (!usuario) return res.json(respuestaGenerica);

            const token = crypto.randomBytes(32).toString('hex');
            await rawPrisma.passwordResetToken.create({
                data: {
                    usuarioId: usuario.id,
                    tokenHash: sha256(token),
                    expiresAt: new Date(Date.now() + RESET_TTL_MS),
                },
            });

            const link = `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${token}`;
            await sendPasswordResetEmail(usuario.email, link);

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
            await rawPrisma.$transaction([
                rawPrisma.usuario.update({ where: { id: registro.usuarioId }, data: { passwordHash } }),
                rawPrisma.passwordResetToken.update({ where: { id: registro.id }, data: { usedAt: new Date() } }),
                // Invalida sesiones activas: hay que volver a loguearse.
                rawPrisma.refreshToken.updateMany({ where: { usuarioId: registro.usuarioId }, data: { isRevoked: true } }),
            ]);

            return res.json({ message: 'Contraseña actualizada. Ya podés iniciar sesión.' });
        } catch (error) {
            next(error);
        }
    }

    static async logout(req: Request, res: Response, next: NextFunction) {
        try {
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
