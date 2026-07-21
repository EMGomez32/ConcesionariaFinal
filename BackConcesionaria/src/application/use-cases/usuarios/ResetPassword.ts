import bcrypt from 'bcryptjs';
import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';

export class ResetPassword {
    constructor(private readonly repository: IUsuarioRepository) { }

    async execute(usuarioId: number, newPassword: string) {
        if (!newPassword || newPassword.length < 6) {
            throw new BaseException(400, 'La contraseña debe tener al menos 6 caracteres', 'VALIDATION_ERROR');
        }

        const exists = await this.repository.findById(usuarioId);
        if (!exists) throw new NotFoundException('Usuario');

        const passwordHash = await bcrypt.hash(newPassword, 10);
        return this.repository.update(usuarioId, { passwordHash });
    }
}
