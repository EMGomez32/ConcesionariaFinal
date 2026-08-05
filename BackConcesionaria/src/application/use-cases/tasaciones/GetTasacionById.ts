import { ITasacionRepository } from '../../../domain/repositories/ITasacionRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetTasacionById {
    constructor(private readonly repository: ITasacionRepository) { }

    async execute(id: number) {
        const tasacion = await this.repository.findById(id);
        if (!tasacion) throw new NotFoundException('Tasación');
        return tasacion;
    }
}
