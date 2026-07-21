import { IPresupuestoRepository } from '../../../domain/repositories/IPresupuestoRepository';
import { QueryOptions } from '../../../types/common';

export class GetPresupuestos {
    constructor(private readonly presupuestoRepository: IPresupuestoRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.presupuestoRepository.findAll(filter, options);
    }
}
