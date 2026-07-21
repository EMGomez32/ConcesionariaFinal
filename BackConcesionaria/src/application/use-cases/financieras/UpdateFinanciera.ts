import { IFinancieraRepository } from '../../../domain/repositories/IFinancieraRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class UpdateFinanciera {
    constructor(private readonly repository: IFinancieraRepository) { }

    async execute(id: number, data: any) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Financiera');
        return this.repository.update(id, data);
    }
}
