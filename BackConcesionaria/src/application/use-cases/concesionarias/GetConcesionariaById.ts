import { IConcesionariaRepository } from '../../../domain/repositories/IConcesionariaRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetConcesionariaById {
    constructor(private readonly concesionariaRepository: IConcesionariaRepository) { }

    async execute(id: number) {
        const c = await this.concesionariaRepository.findById(id);
        if (!c) throw new NotFoundException('Concesionaria');
        return c;
    }
}
