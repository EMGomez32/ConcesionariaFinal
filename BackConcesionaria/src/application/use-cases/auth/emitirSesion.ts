import { ITokenService } from '../../../domain/services/ITokenService';
import { IRefreshTokenRepository } from '../../../domain/repositories/IRefreshTokenRepository';
import { mfaPendiente } from '../../../infrastructure/security/mfaPolicy';
import config from '../../../config';

/**
 * Emite la sesión (access + refresh) de un usuario YA autenticado (contraseña y, si corresponde,
 * segundo factor). Fuente única para Login, LoginSegundoFactor y el re-emitido tras activar el 2FA.
 *
 * `mfaPending`: el rol exige 2FA y el usuario todavía no lo activó → la sesión queda restringida a
 * configurarlo (ver authenticate). Se calcula acá, desde la base, nunca desde lo que mande el cliente.
 */
export interface UsuarioParaSesion {
    id: number;
    nombre: string;
    email: string;
    concesionariaId: number | null;
    sucursalId: number | null;
    totpEnabled: boolean;
    roles: Array<{ deletedAt: Date | null; rol: { nombre: string; deletedAt: Date | null } }>;
}

export async function emitirSesion(
    usuario: UsuarioParaSesion,
    tokenService: ITokenService,
    refreshTokenRepository: IRefreshTokenRepository,
) {
    const roles = usuario.roles.filter((r) => !r.deletedAt && !r.rol.deletedAt).map((r) => r.rol.nombre);
    const pendiente = mfaPendiente(roles, usuario.totpEnabled);

    const payload = {
        userId: usuario.id,
        concesionariaId: usuario.concesionariaId,
        sucursalId: usuario.sucursalId,
        roles,
        ...(pendiente ? { mfaPending: true } : {}),
    };

    const access = tokenService.generateAccessToken(payload);
    const refresh = tokenService.generateRefreshToken(payload);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(config.jwt.refreshExpirationDays));
    await refreshTokenRepository.create({ token: tokenService.hashToken(refresh), usuarioId: usuario.id, expiresAt });

    return {
        user: {
            id: usuario.id,
            nombre: usuario.nombre,
            email: usuario.email,
            roles,
            concesionariaId: usuario.concesionariaId,
            sucursalId: usuario.sucursalId,
            mfaActivo: usuario.totpEnabled,
            ...(pendiente ? { mfaPendiente: true } : {}),
        },
        tokens: { access, refresh },
    };
}
