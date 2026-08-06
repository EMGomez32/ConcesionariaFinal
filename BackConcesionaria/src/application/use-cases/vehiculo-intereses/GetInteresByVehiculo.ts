import { IVehiculoInteresRepository } from '../../../domain/repositories/IVehiculoInteresRepository';

export class GetInteresByVehiculo {
    constructor(private readonly repository: IVehiculoInteresRepository) { }

    async execute(vehiculoId: number) {
        return this.repository.findByVehiculo(vehiculoId);
    }
}
