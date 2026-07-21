import { IIngresoVehiculoRepository } from '../../../domain/repositories/IIngresoVehiculoRepository';
import { QueryOptions } from '../../../types/common';

export class GetIngresosVehiculo {
    constructor(private readonly repository: IIngresoVehiculoRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.repository.findAll(filter, options);
    }
}
