import { IReservaRepository } from '../../../domain/repositories/IReservaRepository';
import { QueryOptions } from '../../../types/common';

export class GetReservas {
    constructor(private readonly reservaRepository: IReservaRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.reservaRepository.findAll(filter, options);
    }
}
