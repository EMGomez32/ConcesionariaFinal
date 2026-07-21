import { IPostventaCasoRepository } from '../../../domain/repositories/IPostventaCasoRepository';
import { QueryOptions } from '../../../types/common';

export class GetCasos {
    constructor(private readonly repository: IPostventaCasoRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.repository.findAll(filter, options);
    }
}
