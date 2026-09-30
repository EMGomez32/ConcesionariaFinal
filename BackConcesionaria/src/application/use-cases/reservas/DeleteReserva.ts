import { Prisma } from '@prisma/client';
import { IReservaRepository } from '../../../domain/repositories/IReservaRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';
import { debeLiberarVehiculo } from '../../../domain/services/reservaVenta';
import { sincronizarEnSegundoPlano } from '../../services/meliPublicacion';

// DELETE /reservas/:id ejecuta una CANCELACIÓN: cambia el estado a 'cancelada',
// libera el vehículo (estado 'publicado') SI SIGUE RESERVADO y registra un
// VehiculoMovimiento de tipo 'liberacion_reserva'. No hace hard-delete.
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
        const tenantSql = isSuper ? Prisma.empty : Prisma.sql`AND concesionaria_id = ${tenantId}`;

        // Unit of Work: cancelar la reserva + liberar el vehículo + registrar el
        // movimiento commitean JUNTOS. Filtros tenant/deletedAt a mano: el tx raw no
        // pasa por la extensión.
        let libero = false;
        const cancelada = await withTenantTransaction(async (tx) => {
            // Orden de locks: VEHÍCULO primero y después la reserva (igual que CreateVenta y
            // UpdateReserva) para que dos operaciones sobre el mismo auto no se
            // interbloqueen. Con el lock se lee el estado ACTUAL: antes se decidía con la
            // lectura de arriba (sin lock) y una venta concurrente quedaba pisada.
            const veh = (await tx.$queryRaw<Array<{ estado: string }>>(Prisma.sql`
                SELECT estado FROM vehiculos
                WHERE id = ${current.vehiculoId} AND deleted_at IS NULL ${tenantSql}
                FOR UPDATE`))[0];
            const res = (await tx.$queryRaw<Array<{ estado: string }>>(Prisma.sql`
                SELECT estado FROM reservas
                WHERE id = ${id} AND deleted_at IS NULL ${tenantSql}
                FOR UPDATE`))[0];
            if (!res) throw new NotFoundException('Reserva');
            if (res.estado === 'cancelada' || res.estado === 'convertida_en_venta') {
                throw new BaseException(400, `La reserva ya está en estado '${res.estado}'`, 'INVALID_STATE');
            }

            const reserva = await tx.reserva.update({
                where: { id, ...tenantWhere, deletedAt: null },
                data: { estado: 'cancelada' },
            });

            if (res.estado === 'activa' && veh) {
                const otras = await tx.reserva.count({
                    where: { vehiculoId: current.vehiculoId, id: { not: id }, estado: 'activa', deletedAt: null, ...tenantWhere },
                });
                // Sólo si el auto SIGUE reservado (no vendido) y no queda otra reserva activa.
                if (debeLiberarVehiculo(veh.estado, otras)) {
                    libero = true;
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
            }

            return reserva;
        });

        // Si el auto volvió a 'publicado', la publicación pausada de Mercado Libre se
        // reactiva acá, después del commit.
        if (libero) sincronizarEnSegundoPlano(current.vehiculoId);

        return cancelada;
    }
}
