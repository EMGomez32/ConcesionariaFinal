import { ICategoriaGastoFijoRepository } from '../../../domain/repositories/ICategoriaGastoFijoRepository';

export class CreateCategoriaGastoFijo {
    constructor(private readonly repository: ICategoriaGastoFijoRepository) { }

    async execute(data: any) {
        return this.repository.create(data);
    }
}
