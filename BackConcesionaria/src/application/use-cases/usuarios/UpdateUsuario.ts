import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import bcrypt from 'bcryptjs';

export class UpdateUsuario {
    constructor(private readonly usuarioRepository: IUsuarioRepository) { }

    async execute(id: number, data: any) {
        const exists: any = await this.usuarioRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Usuario');
        }

        const { password, ...updateData } = data;

        // HU-11: si cambia el email, validar unicidad antes de tirar P2002.
        if (updateData.email && updateData.email !== exists.email) {
            const dup = await this.usuarioRepository.findByEmailInConcesionaria(
                updateData.email,
                exists.concesionariaId
            );
            if (dup && dup.id !== id) {
                throw new BaseException(
                    409,
                    `Ya existe otro usuario con email ${updateData.email} en esta concesionaria`,
                    'EMAIL_DUPLICATED'
                );
            }
        }

        if (password) {
            (updateData as any).passwordHash = await bcrypt.hash(password, 10);
        }

        return this.usuarioRepository.update(id, updateData);
    }
}
