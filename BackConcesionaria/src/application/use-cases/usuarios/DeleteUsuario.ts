import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteUsuario {
    constructor(private readonly usuarioRepository: IUsuarioRepository) { }

    async execute(id: number) {
        const exists = await this.usuarioRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Usuario');
        }
        return this.usuarioRepository.delete(id);
    }
}
