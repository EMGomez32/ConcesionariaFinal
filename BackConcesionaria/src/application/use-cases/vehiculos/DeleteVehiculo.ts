import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteVehiculo {
    constructor(private readonly vehiculoRepository: IVehiculoRepository) { }

    async execute(id: number) {
        const v = await this.vehiculoRepository.findById(id);
        if (!v) {
            throw new NotFoundException('Vehículo');
        }

        const hasVentas = await this.vehiculoRepository.countVentas(id);
        if (hasVentas > 0) {
            throw new BaseException(400, 'No se puede eliminar el vehículo porque tiene ventas asociadas', 'HAS_RELATIONS');
        }

        const hasReservasActivas = await this.vehiculoRepository.countReservasActivas(id);
        if (hasReservasActivas > 0) {
            throw new BaseException(400, 'No se puede eliminar el vehículo porque tiene una reserva activa', 'HAS_RELATIONS');
        }

        return this.vehiculoRepository.delete(id);
    }
}
