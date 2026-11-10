import crypto from 'crypto';
import { ITokenService } from '../../../domain/services/ITokenService';
import { IRefreshTokenRepository } from '../../../domain/repositories/IRefreshTokenRepository';
import { TokenPayload } from '../../../domain/entities/Auth';
import { mfaPendiente } from '../../../infrastructure/security/mfaPolicy';
import { vencimientoDelRefresh } from './vigenciaSesion';

/**
 * Emite la sesión (access + refresh) de un usuario YA autenticado (contraseña y, si corresponde,
 * segundo factor). Fuente única para Login, LoginSegundoFactor y el re-emitido tras activar el 2FA.
 *
 * `mfaPending`: el rol exige 2FA y el usuario todavía no lo activó → la sesión queda restringida a
 * configurarlo (ver authenticate). Se calcula acá, desde la base, nunca desde lo que mande el cliente.
 *
 * Cada emisión es un LOGIN: abre una sesión nueva (familia nueva, `sid` en los tokens) con su reloj
 * absoluto en cero (ver vigenciaSesion). Las rotaciones de RefreshAuth heredan las dos cosas.
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

/** A qué sesión pertenece un refresh: la crea el login y la hereda cada rotación. */
export interface SesionDelRefresh {
    familia: string;
    sesionIniciadaAt: Date;
}

/**
 * Firma un refresh para `payload` dentro de la sesión `sesion` y lo guarda (hasheado), con un
 * vencimiento que nunca pasa del fin absoluto de esa sesión. Fuente única para el login, la
 * rotación (RefreshAuth) y el re-emitido que conserva la sesión web (ConservarSesionActual).
 */
export async function emitirRefresh(
    payload: TokenPayload,
    sesion: SesionDelRefresh,
    tokenService: ITokenService,
    refreshTokenRepository: IRefreshTokenRepository,
): Promise<string> {
    const refresh = tokenService.generateRefreshToken(payload);
    await refreshTokenRepository.create({
        token: tokenService.hashToken(refresh),
        usuarioId: payload.userId,
        expiresAt: vencimientoDelRefresh(sesion.sesionIniciadaAt),
        familia: sesion.familia,
        sesionIniciadaAt: sesion.sesionIniciadaAt,
    });
    return refresh;
}

export async function emitirSesion(
    usuario: UsuarioParaSesion,
    tokenService: ITokenService,
    refreshTokenRepository: IRefreshTokenRepository,
) {
    const roles = usuario.roles.filter((r) => !r.deletedAt && !r.rol.deletedAt).map((r) => r.rol.nombre);
    const pendiente = mfaPendiente(roles, usuario.totpEnabled);
    const sesion: SesionDelRefresh = { familia: crypto.randomUUID(), sesionIniciadaAt: new Date() };

    const payload: TokenPayload = {
        userId: usuario.id,
        concesionariaId: usuario.concesionariaId,
        sucursalId: usuario.sucursalId,
        roles,
        ...(pendiente ? { mfaPending: true } : {}),
        sid: sesion.familia,
    };

    const access = tokenService.generateAccessToken(payload);
    const refresh = await emitirRefresh(payload, sesion, tokenService, refreshTokenRepository);

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
