import { IClienteRepository } from '../../../domain/repositories/IClienteRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetClienteById {
    constructor(private readonly clienteRepository: IClienteRepository) { }

    async execute(id: number) {
        const c = await this.clienteRepository.findById(id);
        if (!c) {
            throw new NotFoundException('Cliente');
        }
        return c;
    }
}
