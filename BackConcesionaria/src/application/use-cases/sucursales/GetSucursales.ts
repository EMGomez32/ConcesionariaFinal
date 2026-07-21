import { ISucursalRepository } from '../../../domain/repositories/ISucursalRepository';
import { QueryOptions } from '../../../types/common';

export class GetSucursales {
    constructor(private readonly sucursalRepository: ISucursalRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.sucursalRepository.findAll(filter, options);
    }
}
