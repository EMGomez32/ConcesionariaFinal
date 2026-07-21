import { IVehiculoMovimientoRepository } from '../../../domain/repositories/IVehiculoMovimientoRepository';
import { QueryOptions } from '../../../types/common';

export class GetMovimientos {
    constructor(private readonly repository: IVehiculoMovimientoRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.repository.findAll(filter, options);
    }
}
