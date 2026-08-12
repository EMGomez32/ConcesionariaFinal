import { IVentaRepository } from '../../../domain/repositories/IVentaRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';

export class DeleteVenta {
    constructor(private readonly ventaRepository: IVentaRepository) { }

    async execute(id: number) {
        const current: any = await this.ventaRepository.findById(id);
        if (!current) throw new NotFoundException('Venta');

        const tenantId = current.concesionariaId;
        const isSuper = context.getUser()?.roles?.includes('super_admin') || false;
        const tenantWhere = isSuper ? {} : { concesionariaId: tenantId };

        // Unit of Work: liberar el vehículo y borrar (soft) la venta commitean JUNTOS.
        // Antes era prisma.$transaction del cliente EXTENDIDO (atomicidad ilusoria): si
        // fallaba el borrado tras liberar el auto, quedaba el vehículo re-vendible con la
        // venta viva → doble venta.
        return withTenantTransaction(async (tx) => {
            await tx.vehiculo.update({
                where: { id: current.vehiculoId, ...tenantWhere, deletedAt: null },
                data: { estado: 'publicado' }
            });

            // TRAMPA: bajo el tx raw, tx.venta.delete() sería un HARD delete real (la
            // reescritura delete→soft-delete la hace la extensión, que aquí NO corre).
            // Por eso el soft-delete se hace a mano.
            return tx.venta.update({
                where: { id, ...tenantWhere, deletedAt: null },
                data: { deletedAt: new Date() }
            });
        });
    }
}
