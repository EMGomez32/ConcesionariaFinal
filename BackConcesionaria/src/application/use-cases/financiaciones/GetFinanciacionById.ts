import { IFinanciacionRepository } from '../../../domain/repositories/IFinanciacionRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetFinanciacionById {
    constructor(private readonly repository: IFinanciacionRepository) { }

    async execute(id: number) {
        const f = await this.repository.findById(id);
        if (!f) throw new NotFoundException('Financiación');
        return f;
    }
}
