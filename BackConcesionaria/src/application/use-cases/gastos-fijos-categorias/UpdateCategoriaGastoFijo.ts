import { ICategoriaGastoFijoRepository } from '../../../domain/repositories/ICategoriaGastoFijoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class UpdateCategoriaGastoFijo {
    constructor(private readonly repository: ICategoriaGastoFijoRepository) { }

    async execute(id: number, data: any) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Categoría');
        return this.repository.update(id, data);
    }
}
