import { RefreshToken } from '../entities/Auth';

/** Lo que hay que guardar de cada refresh emitido. */
export interface NuevoRefreshToken {
    /** Hash del token (nunca el token en claro). */
    token: string;
    usuarioId: number;
    expiresAt: Date;
    /** Sesión a la que pertenece: un login la crea y cada rotación la hereda. */
    familia: string;
    /** Cuándo fue el login de esa sesión (se hereda tal cual en cada rotación). */
    sesionIniciadaAt: Date;
}

export interface IRefreshTokenRepository {
    create(data: NuevoRefreshToken): Promise<RefreshToken>;
    findByToken(token: string): Promise<RefreshToken | null>;
    update(id: number, data: { isRevoked: boolean }): Promise<void>;
    /**
     * Marca como revocado SÓLO si todavía no lo estaba (UPDATE ... WHERE id AND
     * is_revoked = false, atómico). Devuelve true si esta llamada lo "reclamó":
     * dos refresh concurrentes con el mismo token no pueden rotarlo los dos.
     */
    claimForRotation(id: number): Promise<boolean>;
    revokeAllForUser(usuarioId: number): Promise<void>;
    /** Borra la fila del token (por hash). Idempotente: si no existe, no falla. */
    deleteByToken(token: string): Promise<void>;
    /**
     * Cierra TODAS las sesiones del usuario borrando sus filas (salvo `exceptToken`,
     * el hash de la sesión actual, si se pasa). Devuelve cuántas borró.
     * Se BORRA y no se marca isRevoked a propósito: RefreshAuth trata un refresh
     * revocado que reingresa como robo y mata todas las sesiones, incluida la que
     * el usuario abra DESPUÉS de cambiar la contraseña. Borrada, la fila del token
     * viejo simplemente no se encuentra → 401 a secas.
     */
    deleteAllForUser(usuarioId: number, exceptToken?: string): Promise<number>;
    /**
     * Borra todas las filas de UNA sesión (la familia entera: el token vigente y los
     * ya rotados). Se usa al cortarla por vencimiento absoluto: reintentar con
     * cualquiera de sus tokens es después un 401 a secas, sin volver a registrar el
     * corte ni disparar la detección de reuso.
     */
    deleteFamilia(familia: string): Promise<number>;
    /**
     * El refresh VIGENTE (no rotado, no vencido) de la sesión `familia` del usuario,
     * o null si esa sesión ya no puede renovarse. Filtra por usuario además de por
     * familia: el `sid` llega en un access token y no tiene que servir para mirar
     * sesiones ajenas.
     */
    findVigenteDeFamilia(usuarioId: number, familia: string): Promise<RefreshToken | null>;
}
