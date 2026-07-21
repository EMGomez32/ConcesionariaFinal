import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { QueryOptions } from '../../../types/common';

export class GetVehiculos {
    constructor(private readonly vehiculoRepository: IVehiculoRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.vehiculoRepository.findAll(filter, options);
    }
}
