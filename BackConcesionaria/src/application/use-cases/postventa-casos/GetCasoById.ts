import { IPostventaCasoRepository } from '../../../domain/repositories/IPostventaCasoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetCasoById {
    constructor(private readonly repository: IPostventaCasoRepository) { }

    async execute(id: number) {
        const c = await this.repository.findById(id);
        if (!c) throw new NotFoundException('Caso de postventa');
        return c;
    }
}
