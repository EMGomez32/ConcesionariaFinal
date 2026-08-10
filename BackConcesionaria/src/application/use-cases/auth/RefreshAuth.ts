import { ITokenService } from '../../../domain/services/ITokenService';
import { IRefreshTokenRepository } from '../../../domain/repositories/IRefreshTokenRepository';
import { UnauthorizedException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';
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

            const usuario = await prisma.usuario.findUnique({
                where: { id: payload.userId },
                include: { roles: { include: { rol: true } } },
            });
            if (!usuario || !usuario.activo) throw new Error('Invalid user');

            // Rotation
            await this.refreshTokenRepository.update(stored.id, { isRevoked: true });

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
