import { IFinanciacionRepository } from '../../../domain/repositories/IFinanciacionRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertValidTransition } from '../../../domain/services/stateMachine';

export class UpdateFinanciacion {
    constructor(private readonly repository: IFinanciacionRepository) { }

    async execute(id: number, data: any) {
        const exists: any = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Financiación');

        if (data.estado && data.estado !== exists.estado) {
            assertValidTransition('financiacion', exists.estado, data.estado);
        }

        return this.repository.update(id, data);
    }
}
