import { ICategoriaGastoRepository } from '../../../domain/repositories/ICategoriaGastoRepository';

export class CreateCategoriaGasto {
    constructor(private readonly repository: ICategoriaGastoRepository) { }

    async execute(data: any) {
        return this.repository.create(data);
    }
}
