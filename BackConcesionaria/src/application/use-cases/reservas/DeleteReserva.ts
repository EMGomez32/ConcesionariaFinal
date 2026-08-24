import { IReservaRepository } from '../../../domain/repositories/IReservaRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';
import { sincronizarEnSegundoPlano } from '../../services/meliPublicacion';

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
        const tenantId = current.concesionariaId;
        const isSuper = user?.roles?.includes('super_admin') || false;
        const tenantWhere = isSuper ? {} : { concesionariaId: tenantId };

        // Unit of Work: cancelar la reserva + liberar el vehículo + registrar el
        // movimiento commitean JUNTOS (antes: prisma.$transaction del cliente
        // EXTENDIDO, atomicidad ilusoria). Filtros tenant/deletedAt a mano: el tx raw
        // no pasa por la extensión.
        const cancelada = await withTenantTransaction(async (tx) => {
            const reserva = await tx.reserva.update({
                where: { id, ...tenantWhere, deletedAt: null },
                data: { estado: 'cancelada' },
            });

            if (current.estado === 'activa') {
                await tx.vehiculo.update({
                    where: { id: current.vehiculoId, ...tenantWhere },
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

        // Cancelar la reserva devolvió el vehículo a 'publicado': la publicación
        // pausada de Mercado Libre se reactiva acá, después del commit.
        if (current.estado === 'activa') sincronizarEnSegundoPlano(current.vehiculoId);

        return cancelada;
    }
}
