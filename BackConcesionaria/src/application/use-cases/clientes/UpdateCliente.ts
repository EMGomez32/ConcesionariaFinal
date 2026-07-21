import { IClienteRepository } from '../../../domain/repositories/IClienteRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class UpdateCliente {
    constructor(private readonly clienteRepository: IClienteRepository) { }

    async execute(id: number, data: any) {
        const exists = await this.clienteRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Cliente');
        }
        return this.clienteRepository.update(id, data);
    }
}
