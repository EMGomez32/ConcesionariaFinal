import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetVehiculoById {
    constructor(private readonly vehiculoRepository: IVehiculoRepository) { }

    async execute(id: number) {
        const v = await this.vehiculoRepository.findById(id);
        if (!v) {
            throw new NotFoundException('Vehículo');
        }
        return v;
    }
}
