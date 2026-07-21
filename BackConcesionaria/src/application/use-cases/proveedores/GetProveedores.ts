import { IProveedorRepository } from '../../../domain/repositories/IProveedorRepository';
import { QueryOptions } from '../../../types/common';

export class GetProveedores {
    constructor(private readonly proveedorRepository: IProveedorRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        // We can add cross-cutting concerns here (e.g., logging performance)
        return this.proveedorRepository.findAll(filter, options);
    }
}
