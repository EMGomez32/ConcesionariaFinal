import { IVehiculoArchivoRepository } from '../../../domain/repositories/IVehiculoArchivoRepository';

export class GetArchivosByVehiculo {
    constructor(private readonly repository: IVehiculoArchivoRepository) { }

    async execute(vehiculoId: number) {
        return this.repository.findByVehiculo(vehiculoId);
    }
}
