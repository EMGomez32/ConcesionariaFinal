import { ITokenService } from '../../../domain/services/ITokenService';
import { IRefreshTokenRepository } from '../../../domain/repositories/IRefreshTokenRepository';
import { TokenPayload } from '../../../domain/entities/Auth';
import { emitirRefresh, SesionDelRefresh } from './emitirSesion';
import { sesionPasoElMaximo } from './vigenciaSesion';

/**
 * CONSERVAR LA SESIÓN DE LA WEB al cambiar la contraseña o el email propios.
 *
 * Esas operaciones cierran TODAS las sesiones del usuario salvo la que el cliente nombra
 * mandando su refresh (`body.refreshToken`, ver RevokeUserSessions). La web ya no tiene
 * el refresh: vive en la cookie httpOnly, que además sólo viaja a /api/auth. Sin esto,
 * cambiar la contraseña desde Ajustes echaba al propio usuario a los 15 minutos (cuando
 * vencía el access y el refresh de la cookie ya estaba borrado).
 *
 * Cómo: el access token trae el `sid` (la familia de la sesión). ANTES de la operación se
 * toma nota de esa sesión si está vigente; DESPUÉS, si la operación la cerró, se emite un
 * refresh nuevo EN LA MISMA familia y con el MISMO inicio (el reloj absoluto no se
 * reinicia por cambiar la contraseña), y el controller lo pone en la cookie. El refresh
 * que tenía la cookie queda borrado igual que los demás: la sesión sigue, pero con una
 * credencial nueva.
 *
 * No hace nada si la operación no cerró sesiones (p.ej. sólo cambió el nombre), si la
 * sesión ya no estaba vigente (no se resucita una sesión muerta) o si ya pasó su máximo.
 */
export interface SesionCapturada extends SesionDelRefresh {
    usuarioId: number;
}

export class ConservarSesionActual {
    constructor(
        private readonly tokenService: ITokenService,
        private readonly refreshTokenRepository: IRefreshTokenRepository,
    ) { }

    /** Antes de la operación: la sesión `sid` del usuario, si todavía se puede renovar. */
    async capturar(usuarioId: number, sid: string | undefined): Promise<SesionCapturada | null> {
        if (!sid) return null;
        const vigente = await this.refreshTokenRepository.findVigenteDeFamilia(usuarioId, sid);
        if (!vigente || sesionPasoElMaximo(vigente.sesionIniciadaAt)) return null;
        return { usuarioId, familia: vigente.familia, sesionIniciadaAt: vigente.sesionIniciadaAt };
    }

    /**
     * Después de la operación: si cerró la sesión capturada, emite su refresh nuevo (para la
     * cookie). null si la sesión sigue viva (no hizo falta) o no había nada que conservar.
     * `payload` es el de la sesión (el access token actual): RefreshAuth lo reconstruye
     * desde la base en la próxima renovación, así que roles o tenant no quedan congelados.
     */
    async restaurar(captura: SesionCapturada | null, payload: TokenPayload): Promise<string | null> {
        if (!captura || payload.userId !== captura.usuarioId) return null;
        const sigue = await this.refreshTokenRepository.findVigenteDeFamilia(captura.usuarioId, captura.familia);
        if (sigue) return null;
        return emitirRefresh(
            { ...payload, sid: captura.familia },
            { familia: captura.familia, sesionIniciadaAt: captura.sesionIniciadaAt },
            this.tokenService,
            this.refreshTokenRepository,
        );
    }
}
