import { IVentaRepository } from '../../../domain/repositories/IVentaRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertValidTransition } from '../../../domain/services/stateMachine';

const ALLOWED_STATES = ['pendiente', 'bloqueada', 'autorizada', 'entregada', 'cancelada'];

export class ChangeEstadoEntrega {
    constructor(private readonly ventaRepository: IVentaRepository) { }

    async execute(id: number, nuevoEstado: string) {
        if (!ALLOWED_STATES.includes(nuevoEstado)) {
            throw new BaseException(400, `Estado de entrega inválido: ${nuevoEstado}`, 'INVALID_VALUE');
        }

        const venta = await this.ventaRepository.findById(id);
        if (!venta) {
            throw new NotFoundException('Venta');
        }

        assertValidTransition('ventaEntrega', venta.estadoEntrega, nuevoEstado);

        const updateData: any = { estadoEntrega: nuevoEstado };
        if (nuevoEstado === 'entregada') {
            updateData.fechaEntrega = new Date();
        }

        return this.ventaRepository.update(id, updateData);
    }
}
