import { IVentaRepository } from '../../../domain/repositories/IVentaRepository';
import { QueryOptions } from '../../../types/common';

export class GetVentas {
    constructor(private readonly ventaRepository: IVentaRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.ventaRepository.findAll(filter, options);
    }
}
