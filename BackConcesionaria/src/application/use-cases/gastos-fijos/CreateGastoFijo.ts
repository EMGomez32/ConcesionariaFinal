import { IGastoFijoRepository } from '../../../domain/repositories/IGastoFijoRepository';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';

export class CreateGastoFijo {
    constructor(private readonly repository: IGastoFijoRepository) { }

    async execute(data: any) {
        // Sucursal, categoría y proveedor tienen que ser del tenant destino (token
        // para el admin, body.concesionariaId para super_admin): una fila ajena da
        // 404 para el admin y rechazo para super_admin.
        const tenantId = resolveTenantDestino(data?.concesionariaId);
        await assertMismoTenant('sucursal', data?.sucursalId, tenantId);
        await assertMismoTenant('categoriaGastoFijo', data?.categoriaId, tenantId);
        await assertMismoTenant('proveedor', data?.proveedorId, tenantId);
        return this.repository.create(data);
    }
}
