import { IGastoRepository } from '../../../domain/repositories/IGastoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteGasto {
    constructor(private readonly gastoRepository: IGastoRepository) { }

    async execute(id: number) {
        const exists = await this.gastoRepository.findById(id);
        if (!exists) throw new NotFoundException('Gasto');
        return this.gastoRepository.delete(id);
    }
}
