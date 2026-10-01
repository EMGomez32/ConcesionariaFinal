import { ITokenService } from '../../../domain/services/ITokenService';
import { IRefreshTokenRepository } from '../../../domain/repositories/IRefreshTokenRepository';
import { UnauthorizedException } from '../../../domain/exceptions/BaseException';
import { withAuthBypass } from '../../../infrastructure/database/unitOfWork';
import { verificarMfaToken } from '../../../infrastructure/security/mfaToken';
import { verificarSegundoFactor } from '../../services/mfaService';
import { emitirSesion } from './emitirSesion';

/**
 * Segundo paso del login con 2FA: token de "contraseña correcta" (5 min) + código TOTP o de
 * recuperación → sesión. Todos los fallos dan el MISMO error genérico: no se distingue token
 * vencido, código incorrecto o cuenta sin 2FA.
 */
export class LoginSegundoFactor {
    constructor(
        private readonly tokenService: ITokenService,
        private readonly refreshTokenRepository: IRefreshTokenRepository,
    ) { }

    async execute(mfaToken: string, entrada: { codigo?: string; recuperacion?: string }) {
        const falla = () => new UnauthorizedException('Código inválido o vencido');

        const usuarioId = verificarMfaToken(mfaToken);
        if (!usuarioId) throw falla();

        const usuario = await withAuthBypass((tx) => tx.usuario.findFirst({
            where: { id: usuarioId, deletedAt: null },
            include: { roles: { include: { rol: true } } },
        }));
        if (!usuario || !usuario.activo || !usuario.totpEnabled) throw falla();

        const r = await verificarSegundoFactor(usuario.id, entrada);
        if (!r.ok) throw falla();

        const sesion = await emitirSesion(usuario, this.tokenService, this.refreshTokenRepository);
        return { ...sesion, usoRecuperacion: r.usoRecuperacion };
    }
}
