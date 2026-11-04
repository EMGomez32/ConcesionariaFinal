import { Prisma } from '@prisma/client';
import { IReservaRepository } from '../../../domain/repositories/IReservaRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';
import { assertValidTransition } from '../../../domain/services/stateMachine';
import { debeLiberarVehiculo, hoyEnArgentina, problemaDeCambioDeReserva } from '../../../domain/services/reservaVenta';
import { actorEsAdmin } from '../../../infrastructure/security/roles';
import { auditEnTx, detalleConCambio } from '../../../infrastructure/security/auditTx';
import { sincronizarEnSegundoPlano } from '../../services/meliPublicacion';

/**
 * PATCH /reservas/:id. Qué campo puede tocar cada rol lo decide
 * `problemaDeCambioDeReserva` (PROC-33): cancelar y cambiar el monto de la seña
 * son del admin; marcar vencida, sólo con la fecha ya pasada. La auditoría, con el
 * valor anterior y el nuevo de cada campo que cambió (y el motivo si se cancela),
 * se escribe DENTRO de la transacción.
 */
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

        const problema = problemaDeCambioDeReserva({
            esAdmin: actorEsAdmin(),
            hoy: hoyEnArgentina(),
            // El repositorio expone los nombres del front (monto / fechaVencimiento).
            actual: {
                estado: current.estado,
                montoSenia: current.monto ?? null,
                venceEl: current.fechaVencimiento ?? null,
            },
            cambios: { estado: data.estado, monto: data.monto, fechaVencimiento: data.fechaVencimiento },
        });
        if (problema) throw new BaseException(problema.status, problema.message, problema.code);

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
            const res = (await tx.$queryRaw<Array<{
                estado: string; monto_senia: string | null; vence_el: Date | null; observaciones: string | null;
            }>>(Prisma.sql`
                SELECT estado, monto_senia, vence_el, observaciones FROM reservas
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

            // Antes/después SÓLO de lo que cambió, con los valores leídos bajo lock.
            const previo: Record<string, unknown> = {
                estado: res.estado,
                montoSenia: res.monto_senia == null ? null : Number(res.monto_senia),
                venceEl: res.vence_el ? res.vence_el.toISOString().slice(0, 10) : null,
                observaciones: res.observaciones,
            };
            const nuevo: Record<string, unknown> = {
                estado: updated.estado,
                montoSenia: updated.montoSenia == null ? null : Number(updated.montoSenia),
                venceEl: updated.venceEl ? updated.venceEl.toISOString().slice(0, 10) : null,
                observaciones: updated.observaciones,
            };
            const antes: Record<string, unknown> = {};
            const despues: Record<string, unknown> = {};
            for (const k of Object.keys(previo)) {
                if (previo[k] !== nuevo[k]) { antes[k] = previo[k]; despues[k] = nuevo[k]; }
            }
            const cancela = data.estado === 'cancelada' && res.estado !== 'cancelada';
            if (Object.keys(antes).length > 0) {
                await auditEnTx(tx, {
                    concesionariaId: current.concesionariaId,
                    entidad: 'Reserva',
                    entidadId: id,
                    accion: cancela ? 'cancel' : 'update',
                    detalle: detalleConCambio(
                        cancela ? `Reserva ${id} cancelada. Motivo: ${data.motivo}` : `Reserva ${id} actualizada: ${Object.keys(antes).join(', ')}`,
                        { ...(data.motivo ? { motivo: data.motivo } : {}), antes, despues },
                    ),
                });
            }

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
