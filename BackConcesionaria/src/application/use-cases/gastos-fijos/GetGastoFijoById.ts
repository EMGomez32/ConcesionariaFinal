import { IGastoFijoRepository } from '../../../domain/repositories/IGastoFijoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetGastoFijoById {
    constructor(private readonly repository: IGastoFijoRepository) { }

    async execute(id: number) {
        const g = await this.repository.findById(id);
        if (!g) throw new NotFoundException('Gasto fijo');
        return g;
    }
}
