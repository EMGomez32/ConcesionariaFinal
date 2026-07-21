import { ICategoriaGastoFijoRepository } from '../../../domain/repositories/ICategoriaGastoFijoRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteCategoriaGastoFijo {
    constructor(private readonly repository: ICategoriaGastoFijoRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Categoría');

        const hasGastos = await this.repository.countGastosFijos(id);
        if (hasGastos > 0) {
            throw new BaseException(400, 'No se puede eliminar la categoría porque tiene gastos fijos asociados', 'HAS_RELATIONS');
        }
        return this.repository.delete(id);
    }
}
