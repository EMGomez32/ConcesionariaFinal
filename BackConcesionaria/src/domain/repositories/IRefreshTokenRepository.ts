import { RefreshToken } from '../entities/Auth';

export interface IRefreshTokenRepository {
    create(data: { token: string; usuarioId: number; expiresAt: Date }): Promise<RefreshToken>;
    findByToken(token: string): Promise<RefreshToken | null>;
    update(id: number, data: { isRevoked: boolean }): Promise<void>;
    revokeAllForUser(usuarioId: number): Promise<void>;
}
