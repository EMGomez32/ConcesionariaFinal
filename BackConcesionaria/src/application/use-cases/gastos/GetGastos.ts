import { IGastoRepository } from '../../../domain/repositories/IGastoRepository';
import { QueryOptions } from '../../../types/common';

export class GetGastos {
    constructor(private readonly gastoRepository: IGastoRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.gastoRepository.findAll(filter, options);
    }
}
