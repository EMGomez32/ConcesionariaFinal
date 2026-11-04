import { Prisma } from '@prisma/client';
import { IReservaRepository } from '../../../domain/repositories/IReservaRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';
import { assertValidTransition } from '../../../domain/services/stateMachine';
import { debeLiberarVehiculo } from '../../../domain/services/reservaVenta';
import { sincronizarEnSegundoPlano } from '../../services/meliPublicacion';

export class UpdateReserva {
    constructor(private readonly reservaRepository: IReservaRepository) { }

    async execute(id: number, data: any) {
        const current: any = await this.reservaRepository.findById(id);
        if (!current) throw new NotFoundException('Reserva');

        // Una reserva sólo pasa a 'convertida_en_venta' al CREAR la venta (CreateVenta):
        // por PATCH quedaba "convertida" sin venta y con el auto trabado en 'reservado'.
        if (data.estado === 'convertida_en_venta') {
            throw new BaseException(
                400,
                "Una reserva se convierte creando la venta (POST /ventas con reservaId), no cambiando su estado.",
                'CONVERSION_MANUAL',
            );
        }

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

        const tenantId = current.concesionariaId;
        const isSuper = user?.roles?.includes('super_admin') || false;
        const tenantWhere = isSuper ? {} : { concesionariaId: tenantId };
        const tenantSql = isSuper ? Prisma.empty : Prisma.sql`AND concesionaria_id = ${tenantId}`;

        // Unit of Work: el update de la reserva + (si libera) el vehículo + el
        // movimiento commitean JUNTOS.
        let liberoVehiculo = false;
        const reserva = await withTenantTransaction(async (tx) => {
            // Locks en el mismo orden que CreateVenta/DeleteReserva: VEHÍCULO y después
            // reserva. El estado se relee BAJO LOCK: la transición y la liberación se
            // deciden con lo que hay ahora, no con la lectura previa (una venta o una
            // cancelación concurrente ya pudo cambiarlo).
            const veh = (await tx.$queryRaw<Array<{ estado: string }>>(Prisma.sql`
                SELECT estado FROM vehiculos
                WHERE id = ${current.vehiculoId} AND deleted_at IS NULL ${tenantSql}
                FOR UPDATE`))[0];
            const res = (await tx.$queryRaw<Array<{ estado: string }>>(Prisma.sql`
                SELECT estado FROM reservas
                WHERE id = ${id} AND deleted_at IS NULL ${tenantSql}
                FOR UPDATE`))[0];
            if (!res) throw new NotFoundException('Reserva');
            if (data.estado && data.estado !== res.estado) {
                assertValidTransition('reserva', res.estado, data.estado);
            }

            const updated = await tx.reserva.update({
                where: { id, ...tenantWhere, deletedAt: null },
                data: updateData,
            });

            const cierra =
                (data.estado === 'cancelada' || data.estado === 'vencida') && res.estado === 'activa';

            if (cierra && veh) {
                const otras = await tx.reserva.count({
                    where: { vehiculoId: current.vehiculoId, id: { not: id }, estado: 'activa', deletedAt: null, ...tenantWhere },
                });
                // Sólo si el auto SIGUE reservado (no vendido) y no queda otra reserva activa:
                // antes se lo pisaba a 'publicado' sin mirar y un auto vendido se volvía a ofrecer.
                if (debeLiberarVehiculo(veh.estado, otras)) {
                    liberoVehiculo = true;
                    await tx.vehiculo.update({
                        where: { id: current.vehiculoId, ...tenantWhere },
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
            }

            return updated;
        });

        // Si la reserva liberó el vehículo, volvió a 'publicado': la publicación
        // pausada de Mercado Libre se reactiva acá, después del commit.
        if (liberoVehiculo) sincronizarEnSegundoPlano(current.vehiculoId);

        return reserva;
    }
}
