import { ICotizacionRepository } from '../../../domain/repositories/ICotizacionRepository';
import { QueryOptions } from '../../../types/common';

export class GetCotizaciones {
    constructor(private readonly repository: ICotizacionRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.repository.findAll(filter, options);
    }
}
