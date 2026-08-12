import { Prisma } from '@prisma/client';
import { IVentaRepository } from '../../../domain/repositories/IVentaRepository';
import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';

export class CreateVenta {
    constructor(
        private readonly ventaRepository: IVentaRepository,
        private readonly vehiculoRepository: IVehiculoRepository
    ) { }

    async execute(data: any) {
        const { externos, pagos, canjes, reservaId, presupuestoId, ...ventaData } = data;

        const vehiculo = await this.vehiculoRepository.findById(ventaData.vehiculoId);
        if (!vehiculo) throw new NotFoundException('Vehículo');
        if (vehiculo.estado === 'vendido') {
            throw new BaseException(400, 'El vehículo ya está vendido', 'VEHICULO_VENDIDO');
        }

        // La venta hereda el tenant del vehículo (línea de abajo). El resto de las
        // FKs del body tienen que apuntar a ese mismo tenant: si no, un admin
        // podría vincular un cliente/sucursal/presupuesto ajeno (para el admin la
        // fila ajena da 404; para super_admin salta el chequeo de concesionaria).
        const tenantId = (vehiculo as any).concesionariaId;
        await assertMismoTenant('cliente', ventaData.clienteId, tenantId);
        await assertMismoTenant('sucursal', ventaData.sucursalId, tenantId);
        await assertMismoTenant('usuario', ventaData.vendedorId, tenantId);
        await assertMismoTenant('presupuesto', presupuestoId, tenantId);
        await assertMismoTenant('reserva', reservaId, tenantId);
        // Cada canje trae el vehículo que se toma en parte de pago: también tiene
        // que ser del tenant de la venta (el create anida `canjes` sin lookup).
        for (const canje of Array.isArray(canjes) ? canjes : []) {
            await assertMismoTenant('vehiculo', canje?.vehiculoCanjeId, tenantId);
        }

        // Filtro de tenant EXPLÍCITO para el camino raw: la tx de withTenantTransaction
        // NO pasa por la extensión, así que el aislamiento (que la extensión inyecta
        // en cada op) hay que replicarlo a mano. super_admin no se filtra.
        const isSuper = context.getUser()?.roles?.includes('super_admin') || false;
        const tenantSql = isSuper ? Prisma.empty : Prisma.sql`AND concesionaria_id = ${tenantId}`;
        const tenantWhere = isSuper ? {} : { concesionariaId: tenantId };

        // Unit of Work: la venta + sus subrecursos + el marcado de vehículo/reserva/
        // presupuesto commitean JUNTOS o nada. Antes usaba prisma.$transaction del
        // cliente EXTENDIDO → atomicidad ILUSORIA (cada op re-entraba a la extensión y
        // abría su PROPIA sub-tx): si fallaba el update del vehículo tras crear la
        // venta, quedaba plata cobrada con el auto todavía re-vendible.
        return withTenantTransaction(async (tx) => {
            // Lock del vehículo acotado al tenant + revalidación bajo lock: serializa
            // dos ventas concurrentes del MISMO auto (la 2da espera el commit de la 1ra,
            // ve 'vendido' y aborta). Cierra la doble venta que un findById sin lock deja.
            const rows = await tx.$queryRaw<Array<{ estado: string }>>(Prisma.sql`
                SELECT estado FROM vehiculos
                WHERE id = ${ventaData.vehiculoId} AND deleted_at IS NULL ${tenantSql}
                FOR UPDATE`);
            const locked = rows[0];
            if (!locked) throw new NotFoundException('Vehículo');
            if (locked.estado === 'vendido') {
                throw new BaseException(400, 'El vehículo ya está vendido', 'VEHICULO_VENDIDO');
            }

            // 1. Crear la venta. El tenant top-level va explícito (no hay trigger);
            //    los subrecursos (extras/pagos/canjes) heredan concesionaria_id por el
            //    trigger derive_concesionaria_* (BEFORE INSERT), igual que con la extensión.
            const venta = await tx.venta.create({
                data: {
                    ...ventaData,
                    concesionariaId: tenantId,
                    presupuestoId,
                    extras: { create: externos || [] },
                    pagos: { create: pagos || [] },
                    canjes: { create: canjes || [] }
                }
            });

            // 2. Marcar el vehículo como vendido (acotado al tenant + soft-delete:
            //    el tx raw no auto-filtra deletedAt como la extensión).
            await tx.vehiculo.update({
                where: { id: ventaData.vehiculoId, ...tenantWhere, deletedAt: null },
                data: { estado: 'vendido' }
            });

            // 3. Cerrar la reserva si venía de una.
            if (reservaId) {
                await tx.reserva.update({
                    where: { id: reservaId, ...tenantWhere, deletedAt: null },
                    data: { estado: 'convertida_en_venta' }
                });
            }

            // 4. Aceptar el presupuesto si venía de uno.
            if (presupuestoId) {
                await tx.presupuesto.update({
                    where: { id: presupuestoId, ...tenantWhere, deletedAt: null },
                    data: { estado: 'aceptado' }
                });
            }

            return venta;
        });
    }
}
