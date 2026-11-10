import { IRefreshTokenRepository, NuevoRefreshToken } from '../../../domain/repositories/IRefreshTokenRepository';
import { RefreshToken } from '../../../domain/entities/Auth';
import prisma from '../prisma';

export class PrismaRefreshTokenRepository implements IRefreshTokenRepository {
    async create(data: NuevoRefreshToken): Promise<RefreshToken> {
        const r = await prisma.refreshToken.create({
            data: {
                token: data.token,
                usuarioId: data.usuarioId,
                expiresAt: data.expiresAt,
                familia: data.familia,
                sesionIniciadaAt: data.sesionIniciadaAt,
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

    async claimForRotation(id: number): Promise<boolean> {
        const r = await prisma.refreshToken.updateMany({
            where: { id, isRevoked: false },
            data: { isRevoked: true },
        });
        return r.count === 1;
    }

    async deleteAllForUser(usuarioId: number, exceptToken?: string): Promise<number> {
        const r = await prisma.refreshToken.deleteMany({
            where: { usuarioId, ...(exceptToken ? { token: { not: exceptToken } } : {}) },
        });
        return r.count;
    }

    async revokeAllForUser(usuarioId: number): Promise<void> {
        await prisma.refreshToken.updateMany({
            where: { usuarioId },
            data: { isRevoked: true }
        });
    }

    async deleteByToken(token: string): Promise<void> {
        // deleteMany (no delete): idempotente — borra 0 ó 1 fila sin tirar P2025 si
        // el token ya no existe.
        await prisma.refreshToken.deleteMany({ where: { token } });
    }

    async deleteFamilia(familia: string): Promise<number> {
        const r = await prisma.refreshToken.deleteMany({ where: { familia } });
        return r.count;
    }

    async findVigenteDeFamilia(usuarioId: number, familia: string): Promise<RefreshToken | null> {
        const r = await prisma.refreshToken.findFirst({
            where: { usuarioId, familia, isRevoked: false, expiresAt: { gt: new Date() } },
            orderBy: { id: 'desc' },
        });
        return r ? this.mapToEntity(r) : null;
    }

    private mapToEntity(r: any): RefreshToken {
        return new RefreshToken(r.id, r.token, r.usuarioId, r.expiresAt, r.isRevoked, r.createdAt, r.familia, r.sesionIniciadaAt);
    }
}
