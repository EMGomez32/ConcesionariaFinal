import { ICategoriaGastoRepository } from '../../../domain/repositories/ICategoriaGastoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class UpdateCategoriaGasto {
    constructor(private readonly repository: ICategoriaGastoRepository) { }

    async execute(id: number, data: any) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Categoría');
        return this.repository.update(id, data);
    }
}
