import { IIngresoVehiculoRepository } from '../../../domain/repositories/IIngresoVehiculoRepository';

export class CreateIngresoVehiculo {
    constructor(private readonly repository: IIngresoVehiculoRepository) { }

    async execute(data: any) {
        return this.repository.create(data);
    }
}
