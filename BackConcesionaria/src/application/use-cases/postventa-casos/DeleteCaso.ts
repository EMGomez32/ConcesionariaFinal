import { IPostventaCasoRepository } from '../../../domain/repositories/IPostventaCasoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteCaso {
    constructor(private readonly repository: IPostventaCasoRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Caso de postventa');
        return this.repository.delete(id);
    }
}
