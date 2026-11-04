import bcrypt from 'bcryptjs';
import { withAuthBypass } from '../../infrastructure/database/unitOfWork';
import { context } from '../../infrastructure/security/context';
import { BaseException } from '../../domain/exceptions/BaseException';

/**
 * STEP-UP: las acciones que le dan a quien las hace el control de la cuenta de OTRO
 * (resetearle la contraseña, resetearle el 2FA, cambiarle el email) piden la contraseña
 * del actor, no sólo una sesión abierta.
 *
 * Por qué: una sesión robada (un XSS, una PC que quedó abierta, un token filtrado) o una
 * contraseña de admin filtrada sin 2FA alcanzaba para tomar la cuenta de cualquier usuario
 * del tenant en un solo request. Con step-up, el que tiene la sesión pero no la contraseña
 * no puede; y la contraseña sola, con el 2FA obligatorio para admin en producción, tampoco
 * abre la sesión.
 *
 * El error es 400 y no 401 a propósito: un 401 hace que el front intente renovar la sesión
 * o la cierre, cuando lo único que pasó es que el admin tipeó mal su contraseña.
 */
export async function exigirContrasenaDelActor(password: unknown): Promise<void> {
    const uid = context.getUser()?.userId;
    if (!uid) throw new BaseException(401, 'Sesión no válida', 'UNAUTHORIZED');
    if (typeof password !== 'string' || password.length === 0) {
        throw new BaseException(400, 'Para confirmar este cambio, ingresá tu contraseña.', 'STEP_UP_REQUIRED');
    }
    // withAuthBypass: el actor puede ser un super_admin sin tenant (la RLS no lo vería).
    const actor = await withAuthBypass((tx) => tx.usuario.findFirst({
        where: { id: uid, deletedAt: null, activo: true },
        select: { passwordHash: true },
    }));
    const ok = !!actor?.passwordHash && (await bcrypt.compare(password, actor.passwordHash));
    if (!ok) throw new BaseException(400, 'Tu contraseña no es correcta.', 'INVALID_CURRENT_PASSWORD');
}
