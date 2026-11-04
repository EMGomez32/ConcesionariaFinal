import bcrypt from 'bcryptjs';
import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { RevokeUserSessions } from '../auth/RevokeUserSessions';

/** Reset de contraseña de OTRO usuario por un admin. Cierra todas sus sesiones. */
export class ResetPassword {
    constructor(
        private readonly repository: IUsuarioRepository,
        private readonly revokeSessions: RevokeUserSessions,
    ) { }

    async execute(usuarioId: number, newPassword: string) {
        if (!newPassword || newPassword.length < 10) {
            throw new BaseException(400, 'La contraseña debe tener al menos 10 caracteres', 'VALIDATION_ERROR');
        }

        const exists = await this.repository.findById(usuarioId);
        if (!exists) throw new NotFoundException('Usuario');

        const passwordHash = await bcrypt.hash(newPassword, 10);
        const result = await this.repository.update(usuarioId, { passwordHash });
        await this.revokeSessions.execute(usuarioId);
        return result;
    }
}
