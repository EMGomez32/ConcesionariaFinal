import { IGastoRepository } from '../../../domain/repositories/IGastoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetGastoById {
    constructor(private readonly gastoRepository: IGastoRepository) { }

    async execute(id: number) {
        const g = await this.gastoRepository.findById(id);
        if (!g) throw new NotFoundException('Gasto');
        return g;
    }
}
