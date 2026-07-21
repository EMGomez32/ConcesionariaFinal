import { ISolicitudFinanciacionRepository } from '../../../domain/repositories/ISolicitudFinanciacionRepository';
import { QueryOptions } from '../../../types/common';

export class GetSolicitudes {
    constructor(private readonly repository: ISolicitudFinanciacionRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.repository.findAll(filter, options);
    }
}
