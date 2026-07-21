import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { QueryOptions } from '../../../types/common';

export class GetUsuarios {
    constructor(private readonly usuarioRepository: IUsuarioRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.usuarioRepository.findAll(filter, options);
    }
}
