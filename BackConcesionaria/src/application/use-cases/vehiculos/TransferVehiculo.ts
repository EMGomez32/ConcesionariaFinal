import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';

export class TransferVehiculo {
    constructor(private readonly vehiculoRepository: IVehiculoRepository) { }

    async execute(vehiculoId: number, sucursalDestinoId: number, motivo?: string) {
        if (!sucursalDestinoId) {
            throw new BaseException(400, 'sucursalDestinoId es obligatorio', 'VALIDATION_ERROR');
        }

        const vehiculo: any = await this.vehiculoRepository.findById(vehiculoId);
        if (!vehiculo) throw new NotFoundException('Vehículo');

        if (vehiculo.sucursalId === sucursalDestinoId) {
            throw new BaseException(400, 'El vehículo ya está en la sucursal destino', 'INVALID_VALUE');
        }

        const sucursalDestino = await prisma.sucursal.findUnique({ where: { id: sucursalDestinoId } });
        if (!sucursalDestino) throw new NotFoundException('Sucursal destino');
        if (sucursalDestino.concesionariaId !== vehiculo.concesionariaId) {
            throw new BaseException(400, 'La sucursal destino pertenece a otra concesionaria', 'INVALID_VALUE');
        }

        const desdeSucursalId = vehiculo.sucursalId;
        const user = context.getUser();
        const tenantId = vehiculo.concesionariaId;
        const isSuper = user?.roles?.includes('super_admin') || false;
        const tenantWhere = isSuper ? {} : { concesionariaId: tenantId };

        // Unit of Work: mover el vehículo + registrar el traslado commitean JUNTOS
        // (antes: prisma.$transaction del cliente EXTENDIDO, atomicidad ilusoria).
        return withTenantTransaction(async (tx) => {
            const updated = await tx.vehiculo.update({
                where: { id: vehiculoId, ...tenantWhere, deletedAt: null },
                data: { sucursalId: sucursalDestinoId },
            });

            await tx.vehiculoMovimiento.create({
                data: {
                    concesionariaId: vehiculo.concesionariaId,
                    vehiculoId,
                    desdeSucursalId,
                    hastaSucursalId: sucursalDestinoId,
                    tipo: 'traslado',
                    motivo: motivo ?? 'Traslado entre sucursales',
                    registradoPorId: user?.userId ?? null,
                },
            });

            return updated;
        });
    }
}
