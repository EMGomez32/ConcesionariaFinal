import { IConcesionariaRepository } from '../../../domain/repositories/IConcesionariaRepository';
import { QueryOptions } from '../../../types/common';

export class GetConcesionarias {
    constructor(private readonly concesionariaRepository: IConcesionariaRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.concesionariaRepository.findAll(filter, options);
    }
}
