import { Prisma } from '@prisma/client';
import { IReservaRepository } from '../../../domain/repositories/IReservaRepository';
import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';
import { sincronizarEnSegundoPlano } from '../../services/meliPublicacion';

export class CreateReserva {
    constructor(
        private readonly reservaRepository: IReservaRepository,
        private readonly vehiculoRepository: IVehiculoRepository
    ) { }

    async execute(data: any) {
        const { vehiculoId } = data;
        const vehiculo = await this.vehiculoRepository.findById(vehiculoId);
        if (!vehiculo) throw new NotFoundException('Vehículo');
        if (vehiculo.estado === 'reservado' || vehiculo.estado === 'vendido') {
            throw new BaseException(400, 'El vehículo no está disponible para reserva', 'VEHICULO_NOT_AVAILABLE');
        }

        // La reserva hereda el tenant del vehículo: cliente y sucursal tienen que
        // ser de esa misma concesionaria (ajena → 404 para admin, rechazo para
        // super_admin).
        const tenantId = (vehiculo as any).concesionariaId;
        await assertMismoTenant('cliente', data.clienteId, tenantId);
        await assertMismoTenant('sucursal', data.sucursalId, tenantId);
        // vendedorId se persiste como creadaPorId (un Usuario): también del tenant.
        await assertMismoTenant('usuario', data.vendedorId, tenantId);

        const user = context.getUser();
        // Filtro de tenant explícito para el camino raw (la tx NO pasa por la extensión).
        const isSuper = user?.roles?.includes('super_admin') || false;
        const tenantSql = isSuper ? Prisma.empty : Prisma.sql`AND concesionaria_id = ${tenantId}`;
        const tenantWhere = isSuper ? {} : { concesionariaId: tenantId };

        // Unit of Work: reserva + marcado del vehículo + movimiento commitean juntos.
        // Antes era prisma.$transaction del cliente EXTENDIDO (atomicidad ilusoria): si
        // fallaba el update del vehículo, quedaba la reserva con seña pero el auto
        // seguía disponible → se podía reservar/vender dos veces.
        const reserva = await withTenantTransaction(async (tx) => {
            // Lock del vehículo acotado al tenant + revalidación de disponibilidad bajo
            // lock: serializa dos reservas concurrentes del mismo auto.
            const rows = await tx.$queryRaw<Array<{ estado: string }>>(Prisma.sql`
                SELECT estado FROM vehiculos
                WHERE id = ${vehiculoId} AND deleted_at IS NULL ${tenantSql}
                FOR UPDATE`);
            const locked = rows[0];
            if (!locked) throw new NotFoundException('Vehículo');
            if (locked.estado === 'reservado' || locked.estado === 'vendido') {
                throw new BaseException(400, 'El vehículo no está disponible para reserva', 'VEHICULO_NOT_AVAILABLE');
            }

            // El frontend manda monto/moneda/fechaVencimiento/vendedorId; se
            // traducen a las columnas reales (montoSenia/venceEl/creadaPorId).
            const reserva = await tx.reserva.create({
                data: {
                    concesionariaId: tenantId,
                    sucursalId: Number(data.sucursalId),
                    vehiculoId,
                    clienteId: Number(data.clienteId),
                    creadaPorId: data.vendedorId ? Number(data.vendedorId) : (user?.userId ?? null),
                    estado: 'activa',
                    fecha: new Date(),
                    venceEl: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null,
                    montoSenia: data.monto !== undefined && data.monto !== null && data.monto !== '' ? Number(data.monto) : null,
                    moneda: data.moneda || 'ARS',
                    observaciones: data.observaciones || null,
                }
            });

            await tx.vehiculo.update({
                where: { id: vehiculoId, ...tenantWhere, deletedAt: null },
                data: { estado: 'reservado' }
            });

            await tx.vehiculoMovimiento.create({
                data: {
                    concesionariaId: tenantId,
                    vehiculoId,
                    tipo: 'asignacion_reserva',
                    motivo: `Reserva #${reserva.id} creada`,
                    registradoPorId: user?.userId ?? null,
                },
            });

            return reserva;
        });

        // El vehículo quedó 'reservado': la publicación de Mercado Libre se
        // pausa acá, después del commit. Reservar tampoco pasa por
        // UpdateVehiculo, así que sin esto el aviso seguía activo.
        sincronizarEnSegundoPlano(vehiculoId);

        return reserva;
    }
}
