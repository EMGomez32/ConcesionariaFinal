import { ITasacionRepository } from '../../../domain/repositories/ITasacionRepository';
import { QueryOptions } from '../../../types/common';

export class GetTasaciones {
    constructor(private readonly repository: ITasacionRepository) { }

    async execute(filter: any, options: QueryOptions) {
        return this.repository.findAll(filter, options);
    }
}
