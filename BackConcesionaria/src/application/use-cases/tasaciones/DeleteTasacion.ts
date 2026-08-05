import { ITasacionRepository } from '../../../domain/repositories/ITasacionRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteTasacion {
    constructor(private readonly repository: ITasacionRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Tasación');
        return this.repository.delete(id);
    }
}
