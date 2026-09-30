import { RefreshToken } from '../entities/Auth';

export interface IRefreshTokenRepository {
    create(data: { token: string; usuarioId: number; expiresAt: Date }): Promise<RefreshToken>;
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
}
