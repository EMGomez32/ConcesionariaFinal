import { IVentaRepository } from '../../../domain/repositories/IVentaRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class UpdateVenta {
    constructor(private readonly ventaRepository: IVentaRepository) { }

    async execute(id: number, data: any) {
        const exists = await this.ventaRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Venta');
        }

        // Estado de entrega tiene su propio endpoint con validación de transición.
        // No permitir su cambio por este endpoint genérico.
        const { estadoEntrega, fechaEntrega, ...rest } = data;

        return this.ventaRepository.update(id, rest);
    }
}
