import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';
import bcrypt from 'bcryptjs';

export class CreateUsuario {
    constructor(private readonly usuarioRepository: IUsuarioRepository) { }

    async execute(data: any) {
        const { password, ...userData } = data;
        if (!password) {
            throw new BaseException(400, 'La contraseña es obligatoria', 'VALIDATION_ERROR');
        }
        if (password.length < 6) {
            throw new BaseException(400, 'La contraseña debe tener al menos 6 caracteres', 'VALIDATION_ERROR');
        }
        if (!userData.email) {
            throw new BaseException(400, 'El email es obligatorio', 'VALIDATION_ERROR');
        }
        if (!userData.concesionariaId) {
            throw new BaseException(400, 'concesionariaId es obligatorio', 'VALIDATION_ERROR');
        }

        // HU-09: validar unicidad email dentro de la concesionaria.
        // Mejor que dejar a Prisma tirar P2002 con mensaje genérico.
        const dup = await this.usuarioRepository.findByEmailInConcesionaria(
            userData.email,
            userData.concesionariaId
        );
        if (dup) {
            throw new BaseException(
                409,
                `Ya existe un usuario con email ${userData.email} en esta concesionaria`,
                'EMAIL_DUPLICATED'
            );
        }

        const passwordHash = await bcrypt.hash(password, 10);
        return this.usuarioRepository.create({ ...userData, passwordHash });
    }
}
