import { IClienteRepository } from '../../../domain/repositories/IClienteRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';

export class CreateCliente {
    constructor(private readonly clienteRepository: IClienteRepository) { }

    async execute(data: any) {
        if (!data.nombre) {
            throw new BaseException(400, 'El nombre es obligatorio', 'VALIDATION_ERROR');
        }
        return this.clienteRepository.create(data);
    }
}
