import { IGastoFijoRepository } from '../../../domain/repositories/IGastoFijoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteGastoFijo {
    constructor(private readonly repository: IGastoFijoRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Gasto fijo');
        return this.repository.delete(id);
    }
}
