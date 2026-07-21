import { IPresupuestoRepository } from '../../../domain/repositories/IPresupuestoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetPresupuestoById {
    constructor(private readonly presupuestoRepository: IPresupuestoRepository) { }

    async execute(id: number) {
        const p = await this.presupuestoRepository.findById(id);
        if (!p) throw new NotFoundException('Presupuesto');
        return p;
    }
}
