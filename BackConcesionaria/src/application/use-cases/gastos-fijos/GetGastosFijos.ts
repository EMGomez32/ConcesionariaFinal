import { IGastoFijoRepository } from '../../../domain/repositories/IGastoFijoRepository';
import { QueryOptions } from '../../../types/common';

export class GetGastosFijos {
    constructor(private readonly repository: IGastoFijoRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.repository.findAll(filter, options);
    }
}
