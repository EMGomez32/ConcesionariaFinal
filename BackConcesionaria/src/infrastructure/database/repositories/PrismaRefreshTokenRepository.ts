import { IRefreshTokenRepository } from '../../../domain/repositories/IRefreshTokenRepository';
import { RefreshToken } from '../../../domain/entities/Auth';
import prisma from '../prisma';

export class PrismaRefreshTokenRepository implements IRefreshTokenRepository {
    async create(data: { token: string; usuarioId: number; expiresAt: Date }): Promise<RefreshToken> {
        const r = await prisma.refreshToken.create({
            data: {
                token: data.token,
                usuarioId: data.usuarioId,
                expiresAt: data.expiresAt
            }
        });
        return this.mapToEntity(r);
    }

    async findByToken(token: string): Promise<RefreshToken | null> {
        const r = await prisma.refreshToken.findUnique({ where: { token } });
        return r ? this.mapToEntity(r) : null;
    }

    async update(id: number, data: { isRevoked: boolean }): Promise<void> {
        await prisma.refreshToken.update({
            where: { id },
            data: { isRevoked: data.isRevoked }
        });
    }

    async revokeAllForUser(usuarioId: number): Promise<void> {
        await prisma.refreshToken.updateMany({
            where: { usuarioId },
            data: { isRevoked: true }
        });
    }

    private mapToEntity(r: any): RefreshToken {
        return new RefreshToken(r.id, r.token, r.usuarioId, r.expiresAt, r.isRevoked, r.createdAt);
    }
}
