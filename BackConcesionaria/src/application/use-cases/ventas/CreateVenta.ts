import { IVentaRepository } from '../../../domain/repositories/IVentaRepository';
import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';
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
        await assertMismoTenant('presupuesto', presupuestoId, tenantId);
        await assertMismoTenant('reserva', reservaId, tenantId);

        // We can use the Prisma transaction here.
        // In a more pure Clean Architecture, we'd use a UnitOfWork.
        return prisma.$transaction(async (tx) => {
            // 1. Create venta. Note: schema has no `estado` field on Venta —
            // estadoEntrega defaults to 'pendiente' in the database.
            const venta = await tx.venta.create({
                data: {
                    ...ventaData,
                    concesionariaId: vehiculo.concesionariaId, // Multi-tenancy inherited from vehicle
                    presupuestoId,
                    extras: { create: externos || [] },
                    pagos: { create: pagos || [] },
                    canjes: { create: canjes || [] }
                }
            });

            // 2. Mark vehicle as sold
            await tx.vehiculo.update({
                where: { id: ventaData.vehiculoId },
                data: { estado: 'vendido' }
            });

            // 3. Mark reservation as converted if it exists
            if (reservaId) {
                await tx.reserva.update({
                    where: { id: reservaId },
                    data: { estado: 'convertida_en_venta' }
                });
            }

            // 4. Accept budget if it exists
            if (presupuestoId) {
                await tx.presupuesto.update({
                    where: { id: presupuestoId },
                    data: { estado: 'aceptado' }
                });
            }

            return venta;
        });
    }
}
