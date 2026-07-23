import { ISolicitudFinanciacionRepository } from '../../../domain/repositories/ISolicitudFinanciacionRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';

/**
 * Verifica que el vehículo exista y sea de la concesionaria del token.
 * express-validator sólo chequea la forma del id; sin esto, un vehiculoId de
 * otro tenant pasaría, porque la FK sólo falla si el id no existe en TODA la
 * base. La extensión RLS inyecta el concesionariaId en el where, así que un
 * vehículo ajeno devuelve null acá.
 */
export async function assertVehiculoDelTenant(vehiculoId: unknown): Promise<void> {
    if (vehiculoId === undefined || vehiculoId === null) return;
    const vehiculo = await prisma.vehiculo.findUnique({ where: { id: Number(vehiculoId) } });
    if (!vehiculo) throw new NotFoundException('Vehículo');
}

export class CreateSolicitud {
    constructor(private readonly repository: ISolicitudFinanciacionRepository) { }

    async execute(data: any) {
        await assertVehiculoDelTenant(data?.vehiculoId);
        // El resto de las FKs del legajo (sucursal, venta, presupuesto, cliente y
        // financiera) tienen que ser del tenant destino: para el admin una ajena da
        // 404; para super_admin se rechaza el cruce contra la concesionaria destino.
        const tenantId = resolveTenantDestino(data?.concesionariaId);
        await assertMismoTenant('sucursal', data?.sucursalId, tenantId);
        await assertMismoTenant('venta', data?.ventaId, tenantId);
        await assertMismoTenant('presupuesto', data?.presupuestoId, tenantId);
        await assertMismoTenant('cliente', data?.clienteId, tenantId);
        await assertMismoTenant('financiera', data?.financieraId, tenantId);
        return this.repository.create(data);
    }
}
