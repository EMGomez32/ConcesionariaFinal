import { ITokenService } from '../../../domain/services/ITokenService';
import { IRefreshTokenRepository } from '../../../domain/repositories/IRefreshTokenRepository';
import { SesionMaximaVencidaException, UnauthorizedException } from '../../../domain/exceptions/BaseException';
import { TokenPayload } from '../../../domain/entities/Auth';
import { withAuthBypass } from '../../../infrastructure/database/unitOfWork';
import { mfaPendiente } from '../../../infrastructure/security/mfaPolicy';
import { recordSecurityEvent } from '../../../infrastructure/security/securityEvents';
import { notificarAlertaSeguridad } from '../../../infrastructure/security/alertasSeguridad';
import { context } from '../../../infrastructure/security/context';
import { emitirRefresh } from './emitirSesion';
import { maxDiasSesion, sesionPasoElMaximo } from './vigenciaSesion';

export class RefreshAuth {
    constructor(
        private readonly tokenService: ITokenService,
        private readonly refreshTokenRepository: IRefreshTokenRepository
    ) { }

    async execute(refreshToken: string) {
        try {
            const payload = this.tokenService.verifyRefreshToken(refreshToken);
            const hashed = this.tokenService.hashToken(refreshToken);
            const stored = await this.refreshTokenRepository.findByToken(hashed);

            if (!stored) throw new Error('Not found');

            if (stored.isRevoked) {
                // REUSO de un refresh ya rotado: o lo robaron, o lo tiene alguien más. Se cortan
                // todas las sesiones del usuario y, ahora, queda el rastro y sale la alerta (antes
                // pasaba en silencio y nadie se enteraba de una sesión robada).
                await this.refreshTokenRepository.revokeAllForUser(stored.usuarioId);
                await recordSecurityEvent({
                    accion: 'refresh_reuse',
                    entidad: 'Usuario',
                    entidadId: stored.usuarioId,
                    usuarioId: stored.usuarioId,
                    detalle: 'Reuso de un refresh token ya rotado: se cerraron todas las sesiones del usuario',
                    ip: context.getIp() ?? null,
                    userAgent: context.getUserAgent() ?? null,
                });
                notificarAlertaSeguridad({
                    tipo: 'refresh_reuse',
                    usuarioId: stored.usuarioId,
                    detalle: 'Reuso de un refresh token ya rotado (posible sesión robada); se cerraron todas sus sesiones',
                });
                throw new Error('Revoked');
            }

            // VENCIMIENTO ABSOLUTO (APP-11): la sesión no vive más de SESION_MAX_DIAS desde el
            // login, por más que se haya renovado ayer. Va DESPUÉS del reuso (un token robado
            // de una sesión vieja sigue siendo la señal más importante) y ANTES del vencimiento
            // deslizante: la fila vence a lo sumo en el fin de la sesión, y el cliente tiene que
            // recibir el motivo real (SESION_MAXIMA_VENCIDA) y no un 401 genérico.
            if (sesionPasoElMaximo(stored.sesionIniciadaAt)) {
                const maxDias = maxDiasSesion();
                // Se borra la familia entera: reintentar con este token (u otro ya rotado de
                // la misma sesión) es después un 401 a secas, sin volver a registrar el corte.
                await this.refreshTokenRepository.deleteFamilia(stored.familia).catch(() => 0);
                await recordSecurityEvent({
                    accion: 'sesion_vencida',
                    entidad: 'Usuario',
                    entidadId: stored.usuarioId,
                    usuarioId: stored.usuarioId,
                    detalle: `Sesión cortada por vencimiento absoluto: pasaron ${maxDias} días desde el login (${stored.sesionIniciadaAt.toISOString()})`,
                    ip: context.getIp() ?? null,
                    userAgent: context.getUserAgent() ?? null,
                });
                throw new SesionMaximaVencidaException(maxDias);
            }

            if (stored.expiresAt < new Date()) throw new Error('Expired');

            // withAuthBypass: el refresh valida al usuario fuera de una sesión (sin
            // tenant en contexto). Bajo app_rw la RLS filtraría `usuarios`; se saltea
            // explícito. `deletedAt: null` a mano (no pasa por la extensión).
            const usuario = await withAuthBypass((tx) => tx.usuario.findFirst({
                where: { id: payload.userId, deletedAt: null },
                include: { roles: { include: { rol: true } } },
            }));
            if (!usuario || !usuario.activo) throw new Error('Invalid user');

            // Rotation ATÓMICA: el UPDATE ... WHERE is_revoked = false lo gana una sola
            // request. Antes era leer-y-después-actualizar: dos refresh concurrentes con
            // el mismo token pasaban los dos y emitían dos cadenas de sesión válidas.
            // El que pierde la carrera recibe 401 a secas (no dispara la detección de
            // reuso: en la carrera no hay forma de distinguir un doble envío legítimo de
            // un robo, y matar todas las sesiones por un doble clic sería peor).
            const claimed = await this.refreshTokenRepository.claimForRotation(stored.id);
            if (!claimed) throw new Error('Concurrent rotation');

            // Reconstruir el payload desde la DB, NO del token viejo. Dos motivos:
            //  1) `payload` (jwt.verify del refresh) trae los claims reservados de JWT
            //     (exp, iat, jti); si se spread-eaban, jwt.sign explotaba con
            //     "options.expiresIn ... payload already has an exp property" y TODO
            //     refresh devolvía 401.
            //  2) Leer roles/tenant frescos de la DB hace que un rol revocado o un
            //     cambio de concesionaria se apliquen en el próximo refresh, en vez de
            //     quedar congelados desde el token (control de acceso). Mismo filtro de
            //     soft-delete que Login.
            const roles = usuario.roles
                .filter((r) => !r.deletedAt && !r.rol.deletedAt)
                .map((r) => r.rol.nombre);
            const newPayload: TokenPayload = {
                userId: usuario.id,
                concesionariaId: usuario.concesionariaId,
                sucursalId: usuario.sucursalId,
                roles,
                // El rol exige 2FA y el usuario aún no lo activó: sigue restringido a configurarlo.
                ...(mfaPendiente(roles, usuario.totpEnabled) ? { mfaPending: true } : {}),
                // La sesión es la MISMA: el access nuevo la sigue nombrando igual.
                sid: stored.familia,
            };
            const access = this.tokenService.generateAccessToken(newPayload);
            // Hereda familia e inicio: rotar no reinicia el reloj absoluto.
            const refresh = await emitirRefresh(
                newPayload,
                { familia: stored.familia, sesionIniciadaAt: stored.sesionIniciadaAt },
                this.tokenService,
                this.refreshTokenRepository,
            );

            return { access, refresh };
        } catch (e) {
            // El vencimiento absoluto sale con su código; todo lo demás, el 401 genérico de
            // siempre (no se le cuenta al cliente si el token no existe, venció o se reusó).
            if (e instanceof SesionMaximaVencidaException) throw e;
            throw new UnauthorizedException('Refresh token inválido');
        }
    }
}
