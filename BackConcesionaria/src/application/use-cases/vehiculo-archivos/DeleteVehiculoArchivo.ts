import { IVehiculoArchivoRepository } from '../../../domain/repositories/IVehiculoArchivoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteVehiculoArchivo {
    constructor(private readonly repository: IVehiculoArchivoRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Archivo');
        return this.repository.delete(id);
    }
}
