import { IVehiculoInteresRepository } from '../../../domain/repositories/IVehiculoInteresRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteVehiculoInteres {
    constructor(private readonly repository: IVehiculoInteresRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Interés');
        return this.repository.delete(id);
    }
}
