import { IFinancieraRepository } from '../../../domain/repositories/IFinancieraRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetFinancieraById {
    constructor(private readonly repository: IFinancieraRepository) { }

    async execute(id: number) {
        const f = await this.repository.findById(id);
        if (!f) throw new NotFoundException('Financiera');
        return f;
    }
}
