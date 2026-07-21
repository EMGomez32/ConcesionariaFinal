import { IConcesionariaRepository } from '../../../domain/repositories/IConcesionariaRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class UpdateConcesionaria {
    constructor(private readonly concesionariaRepository: IConcesionariaRepository) { }

    async execute(id: number, data: any) {
        const exists = await this.concesionariaRepository.findById(id);
        if (!exists) throw new NotFoundException('Concesionaria');
        return this.concesionariaRepository.update(id, data);
    }
}
