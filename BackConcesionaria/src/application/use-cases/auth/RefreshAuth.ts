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

            const usuario = await prisma.usuario.findUnique({ where: { id: payload.userId } });
            if (!usuario || !usuario.activo) throw new Error('Invalid user');

            // Rotation
            await this.refreshTokenRepository.update(stored.id, { isRevoked: true });

            const newPayload = { ...payload };
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
