import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetUsuarioById {
    constructor(private readonly usuarioRepository: IUsuarioRepository) { }

    async execute(id: number) {
        const u = await this.usuarioRepository.findById(id);
        if (!u) {
            throw new NotFoundException('Usuario');
        }
        return u;
    }
}
