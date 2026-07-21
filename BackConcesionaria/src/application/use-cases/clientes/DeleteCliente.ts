import { IClienteRepository } from '../../../domain/repositories/IClienteRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteCliente {
    constructor(private readonly clienteRepository: IClienteRepository) { }

    async execute(id: number) {
        const exists = await this.clienteRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Cliente');
        }

        const hasVentas = await this.clienteRepository.countVentas(id);
        if (hasVentas > 0) {
            throw new BaseException(400, 'No se puede eliminar el cliente porque tiene ventas asociadas', 'HAS_RELATIONS');
        }

        const hasPresupuestos = await this.clienteRepository.countPresupuestos(id);
        if (hasPresupuestos > 0) {
            throw new BaseException(400, 'No se puede eliminar el cliente porque tiene presupuestos asociados', 'HAS_RELATIONS');
        }

        return this.clienteRepository.delete(id);
    }
}
