import { IConcesionariaRepository } from '../../../domain/repositories/IConcesionariaRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';

export class CreateConcesionaria {
    constructor(private readonly concesionariaRepository: IConcesionariaRepository) { }

    async execute(data: any) {
        if (!data.nombre) throw new BaseException(400, 'Nombre es obligatorio', 'VALIDATION_ERROR');
        return this.concesionariaRepository.create(data);
    }
}
