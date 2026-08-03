import { IClienteSeguimientoRepository } from '../../../domain/repositories/IClienteSeguimientoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteClienteSeguimiento {
    constructor(private readonly repository: IClienteSeguimientoRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Seguimiento');
        return this.repository.delete(id);
    }
}
