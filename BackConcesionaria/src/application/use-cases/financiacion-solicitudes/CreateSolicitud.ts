import { ISolicitudFinanciacionRepository } from '../../../domain/repositories/ISolicitudFinanciacionRepository';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';

export class CreateSolicitud {
    constructor(private readonly repository: ISolicitudFinanciacionRepository) { }

    async execute(data: any) {
        // Todas las FKs del legajo (vehículo, sucursal, venta, presupuesto, cliente
        // y financiera) tienen que ser del tenant destino: para el admin una ajena
        // da 404; para super_admin se rechaza el cruce contra la concesionaria
        // destino. Se compara el vehículo igual que las demás (antes usaba un
        // chequeo de sólo-existencia que dejaba abierto el camino de super_admin).
        const tenantId = resolveTenantDestino(data?.concesionariaId);
        await assertMismoTenant('vehiculo', data?.vehiculoId, tenantId);
        await assertMismoTenant('sucursal', data?.sucursalId, tenantId);
        await assertMismoTenant('venta', data?.ventaId, tenantId);
        await assertMismoTenant('presupuesto', data?.presupuestoId, tenantId);
        await assertMismoTenant('cliente', data?.clienteId, tenantId);
        await assertMismoTenant('financiera', data?.financieraId, tenantId);
        return this.repository.create(data);
    }
}
