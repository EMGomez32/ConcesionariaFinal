import { ICategoriaGastoRepository } from '../../../domain/repositories/ICategoriaGastoRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteCategoriaGasto {
    constructor(private readonly repository: ICategoriaGastoRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Categoría');

        const hasGastos = await this.repository.countGastos(id);
        if (hasGastos > 0) {
            throw new BaseException(400, 'No se puede eliminar la categoría porque tiene gastos asociados', 'HAS_RELATIONS');
        }
        return this.repository.delete(id);
    }
}
