import { IVehiculoArchivoRepository } from '../../../domain/repositories/IVehiculoArchivoRepository';

export class CreateVehiculoArchivo {
    constructor(private readonly repository: IVehiculoArchivoRepository) { }

    async execute(data: any) {
        return this.repository.create(data);
    }
}
