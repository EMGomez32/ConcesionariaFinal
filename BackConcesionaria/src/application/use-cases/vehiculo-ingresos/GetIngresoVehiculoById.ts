import { IIngresoVehiculoRepository } from '../../../domain/repositories/IIngresoVehiculoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetIngresoVehiculoById {
    constructor(private readonly repository: IIngresoVehiculoRepository) { }

    async execute(id: number) {
        const i = await this.repository.findById(id);
        if (!i) throw new NotFoundException('Ingreso de vehículo');
        return i;
    }
}
