import { IGastoFijoRepository } from '../../../domain/repositories/IGastoFijoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class UpdateGastoFijo {
    constructor(private readonly repository: IGastoFijoRepository) { }

    async execute(id: number, data: any) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Gasto fijo');
        return this.repository.update(id, data);
    }
}
