import { IIngresoVehiculoRepository } from '../../../domain/repositories/IIngresoVehiculoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteIngresoVehiculo {
    constructor(private readonly repository: IIngresoVehiculoRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Ingreso de vehículo');
        return this.repository.delete(id);
    }
}
