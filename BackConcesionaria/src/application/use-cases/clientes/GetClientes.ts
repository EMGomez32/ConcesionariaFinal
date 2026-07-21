import { IClienteRepository } from '../../../domain/repositories/IClienteRepository';
import { QueryOptions } from '../../../types/common';

export class GetClientes {
    constructor(private readonly clienteRepository: IClienteRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.clienteRepository.findAll(filter, options);
    }
}
