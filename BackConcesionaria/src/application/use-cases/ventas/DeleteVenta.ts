import { IVentaRepository } from '../../../domain/repositories/IVentaRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';

export class DeleteVenta {
    constructor(private readonly ventaRepository: IVentaRepository) { }

    async execute(id: number) {
        const current = await this.ventaRepository.findById(id);
        if (!current) throw new NotFoundException('Venta');

        return prisma.$transaction(async (tx) => {
            // Revert vehicle state to 'publicado'
            await tx.vehiculo.update({
                where: { id: current.vehiculoId },
                data: { estado: 'publicado' }
            });

            // Soft-delete the venta
            return tx.venta.delete({ where: { id } });
        });
    }
}
