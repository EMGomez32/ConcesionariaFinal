import { ITokenService } from '../../../domain/services/ITokenService';
import { IRefreshTokenRepository } from '../../../domain/repositories/IRefreshTokenRepository';

/**
 * Cierra la sesión invalidando su refresh token, para que un token robado (o
 * simplemente viejo) deje de servir apenas el usuario hace logout — en vez de seguir
 * válido hasta que expire (días). Complementa la rotación con detección de reuso de
 * RefreshAuth.
 *
 * El token se BORRA (no se marca `isRevoked`) a propósito: RefreshAuth trata todo
 * refresh REVOCADO que reingrese como reuso de token robado y ejecuta
 * revokeAllForUser (mata TODAS las sesiones del usuario). Si en logout marcáramos
 * isRevoked, una request de refresh en carrera con ese mismo token dispararía esa
 * detección y tiraría también las sesiones de otros dispositivos. Al borrar la fila,
 * un reingreso simplemente no se encuentra → 401 a secas, sin tocar las demás
 * sesiones. Sólo se toca ESTA sesión.
 *
 * Best-effort e idempotente: cerrar sesión SIEMPRE "funciona" desde la óptica del
 * usuario. Si no viene el token o ya no existe, no falla.
 */
export class LogoutAuth {
    constructor(
        private readonly tokenService: ITokenService,
        private readonly refreshTokenRepository: IRefreshTokenRepository
    ) { }

    async execute(refreshToken?: string | null): Promise<void> {
        if (!refreshToken) return;

        // Los refresh tokens se guardan hasheados (sha256): hasheamos el recibido
        // para ubicar la fila.
        const tokenHash = this.tokenService.hashToken(refreshToken);
        await this.refreshTokenRepository.deleteByToken(tokenHash);
    }
}
