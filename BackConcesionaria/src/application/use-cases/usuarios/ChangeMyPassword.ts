import bcrypt from 'bcryptjs';
import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';

/**
 * Cambio de contraseña por el propio usuario (autogestión desde Configuración).
 *
 * A diferencia de `ResetPassword` (que usa un admin para setear la clave de
 * OTRO usuario sin conocer la anterior), acá el usuario cambia LA SUYA, así que
 * se exige y verifica la contraseña actual. Sin esa verificación, una sesión
 * abierta olvidada bastaría para que un tercero cambie la clave y tome la cuenta.
 */
export class ChangeMyPassword {
    constructor(private readonly repository: IUsuarioRepository) { }

    async execute(usuarioId: number, currentPassword: string, newPassword: string) {
        if (!newPassword || newPassword.length < 6) {
            throw new BaseException(400, 'La nueva contraseña debe tener al menos 6 caracteres', 'VALIDATION_ERROR');
        }

        const usuario: any = await this.repository.findById(usuarioId);
        if (!usuario) throw new NotFoundException('Usuario');

        const ok = await bcrypt.compare(currentPassword || '', usuario.passwordHash || '');
        if (!ok) {
            throw new BaseException(400, 'La contraseña actual es incorrecta', 'INVALID_CURRENT_PASSWORD');
        }

        // Evita el no-op de "cambiar" a la misma clave (una fricción sin sentido:
        // pide algo distinto de forma explícita en lugar de aceptarlo en silencio).
        const igual = await bcrypt.compare(newPassword, usuario.passwordHash || '');
        if (igual) {
            throw new BaseException(400, 'La nueva contraseña debe ser distinta de la actual', 'SAME_PASSWORD');
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        return this.repository.update(usuarioId, { passwordHash });
    }
}
