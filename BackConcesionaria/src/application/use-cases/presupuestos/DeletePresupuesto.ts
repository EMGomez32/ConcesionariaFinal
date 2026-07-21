import { IPresupuestoRepository } from '../../../domain/repositories/IPresupuestoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeletePresupuesto {
    constructor(private readonly presupuestoRepository: IPresupuestoRepository) { }

    async execute(id: number) {
        const exists = await this.presupuestoRepository.findById(id);
        if (!exists) throw new NotFoundException('Presupuesto');
        return this.presupuestoRepository.delete(id);
    }
}
