import { ICategoriaGastoFijoRepository } from '../../../domain/repositories/ICategoriaGastoFijoRepository';

export class GetCategoriasGastoFijo {
    constructor(private readonly repository: ICategoriaGastoFijoRepository) { }

    async execute(concesionariaId: number) {
        return this.repository.findAll(concesionariaId);
    }
}
