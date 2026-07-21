import { IReservaRepository } from '../../../domain/repositories/IReservaRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';
import { context } from '../../../infrastructure/security/context';

// DELETE /reservas/:id ejecuta una CANCELACIÓN: cambia el estado a 'cancelada',
// libera el vehículo (estado 'publicado') y registra un VehiculoMovimiento de
// tipo 'liberacion_reserva'. No hace hard-delete.
export class DeleteReserva {
    constructor(private readonly reservaRepository: IReservaRepository) { }

    async execute(id: number) {
        const current: any = await this.reservaRepository.findById(id);
        if (!current) throw new NotFoundException('Reserva');

        if (current.estado === 'cancelada' || current.estado === 'convertida_en_venta') {
            throw new BaseException(400, `La reserva ya está en estado '${current.estado}'`, 'INVALID_STATE');
        }

        const user = context.getUser();

        return prisma.$transaction(async (tx) => {
            const reserva = await tx.reserva.update({
                where: { id },
                data: { estado: 'cancelada' },
            });

            if (current.estado === 'activa') {
                await tx.vehiculo.update({
                    where: { id: current.vehiculoId },
                    data: { estado: 'publicado' },
                });

                await tx.vehiculoMovimiento.create({
                    data: {
                        concesionariaId: current.concesionariaId,
                        vehiculoId: current.vehiculoId,
                        tipo: 'liberacion_reserva',
                        motivo: `Cancelación de reserva #${id}`,
                        registradoPorId: user?.userId ?? null,
                    },
                });
            }

            return reserva;
        });
    }
}
