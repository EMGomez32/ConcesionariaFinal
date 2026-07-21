import { IFinanciacionRepository } from '../../../domain/repositories/IFinanciacionRepository';
import { QueryOptions } from '../../../types/common';

export class GetFinanciaciones {
    constructor(private readonly repository: IFinanciacionRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.repository.findAll(filter, options);
    }
}
