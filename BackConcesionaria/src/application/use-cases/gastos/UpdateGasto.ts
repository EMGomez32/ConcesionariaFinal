import { IGastoRepository } from '../../../domain/repositories/IGastoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class UpdateGasto {
    constructor(private readonly gastoRepository: IGastoRepository) { }

    async execute(id: number, data: any) {
        const exists = await this.gastoRepository.findById(id);
        if (!exists) throw new NotFoundException('Gasto');
        return this.gastoRepository.update(id, data);
    }
}
