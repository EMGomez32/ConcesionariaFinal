import { ITokenService } from '../../../domain/services/ITokenService';
import { IRefreshTokenRepository } from '../../../domain/repositories/IRefreshTokenRepository';

/**
 * Cierra las sesiones (refresh tokens) de un usuario. Se dispara cuando cambian
 * sus credenciales o su estado: contraseña, email, desactivación o baja. Sin esto
 * un refresh token robado seguía válido hasta 7 días aunque la víctima cambiara la
 * contraseña.
 *
 * `keepRefreshToken` (el refresh de la sesión ACTUAL, tal como lo tiene el cliente)
 * conserva esa sesión: quien cambia SU propia contraseña no debería tener que
 * volver a loguearse, pero sí cerrar todas las demás. Si no se pasa, se cierran todas.
 *
 * Límite conocido: el access token ya emitido sigue valiendo hasta que expire
 * (JWT_EXPIRES_IN, 15 min); lo que se corta acá es la posibilidad de renovarlo.
 */
export class RevokeUserSessions {
    constructor(
        private readonly tokenService: ITokenService,
        private readonly refreshTokenRepository: IRefreshTokenRepository,
    ) { }

    async execute(usuarioId: number, keepRefreshToken?: string | null): Promise<number> {
        const keepHash = keepRefreshToken ? this.tokenService.hashToken(keepRefreshToken) : undefined;
        return this.refreshTokenRepository.deleteAllForUser(usuarioId, keepHash);
    }
}
