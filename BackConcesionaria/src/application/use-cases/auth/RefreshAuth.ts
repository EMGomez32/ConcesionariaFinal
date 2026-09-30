import { ITokenService } from '../../../domain/services/ITokenService';
import { IRefreshTokenRepository } from '../../../domain/repositories/IRefreshTokenRepository';
import { UnauthorizedException } from '../../../domain/exceptions/BaseException';
import { withAuthBypass } from '../../../infrastructure/database/unitOfWork';
import config from '../../../config';

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
                await this.refreshTokenRepository.revokeAllForUser(stored.usuarioId);
                throw new Error('Revoked');
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
            const newPayload = {
                userId: usuario.id,
                concesionariaId: usuario.concesionariaId,
                sucursalId: usuario.sucursalId,
                roles,
            };
            const access = this.tokenService.generateAccessToken(newPayload);
            const refresh = this.tokenService.generateRefreshToken(newPayload);

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + parseInt(config.jwt.refreshExpirationDays));

            await this.refreshTokenRepository.create({
                token: this.tokenService.hashToken(refresh),
                usuarioId: usuario.id,
                expiresAt
            });

            return { access, refresh };
        } catch (e) {
            throw new UnauthorizedException('Refresh token inválido');
        }
    }
}
