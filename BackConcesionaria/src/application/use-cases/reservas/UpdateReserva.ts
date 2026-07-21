import { IReservaRepository } from '../../../domain/repositories/IReservaRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';
import { context } from '../../../infrastructure/security/context';
import { assertValidTransition } from '../../../domain/services/stateMachine';

export class UpdateReserva {
    constructor(private readonly reservaRepository: IReservaRepository) { }

    async execute(id: number, data: any) {
        const current: any = await this.reservaRepository.findById(id);
        if (!current) throw new NotFoundException('Reserva');

        if (data.estado && data.estado !== current.estado) {
            assertValidTransition('reserva', current.estado, data.estado);
        }

        const user = context.getUser();

        // Traducir nombres del frontend a columnas reales.
        const updateData: any = {};
        if (data.estado !== undefined) updateData.estado = data.estado;
        if (data.observaciones !== undefined) updateData.observaciones = data.observaciones;
        if (data.moneda !== undefined) updateData.moneda = data.moneda;
        if (data.monto !== undefined) updateData.montoSenia = data.monto !== null && data.monto !== '' ? Number(data.monto) : null;
        if (data.fechaVencimiento !== undefined) updateData.venceEl = data.fechaVencimiento ? new Date(data.fechaVencimiento) : null;

        return prisma.$transaction(async (tx) => {
            const updated = await tx.reserva.update({
                where: { id },
                data: updateData,
            });

            const liberaVehiculo =
                (data.estado === 'cancelada' || data.estado === 'vencida') &&
                current.estado === 'activa';

            if (liberaVehiculo) {
                await tx.vehiculo.update({
                    where: { id: current.vehiculoId },
                    data: { estado: 'publicado' },
                });

                await tx.vehiculoMovimiento.create({
                    data: {
                        concesionariaId: current.concesionariaId,
                        vehiculoId: current.vehiculoId,
                        tipo: 'liberacion_reserva',
                        motivo: `Reserva #${id} pasó a ${data.estado}`,
                        registradoPorId: user?.userId ?? null,
                    },
                });
            }

            return updated;
        });
    }
}
