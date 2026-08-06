import { IVehiculoInteresRepository } from '../../../domain/repositories/IVehiculoInteresRepository';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';

export class CreateVehiculoInteres {
    constructor(private readonly repository: IVehiculoInteresRepository) { }

    async execute(data: any) {
        // El cliente ancla el tenant de la fila. Para admin/vendedor sale del token;
        // para super_admin sin tenant explícito lo DERIVAMOS de la fila del cliente
        // (assertMismoTenant devuelve la fila). Sin esto, el create de un super_admin
        // llegaría sin concesionariaId → Prisma "Argument concesionaria is missing" (500).
        let tenantId = resolveTenantDestino(data?.concesionariaId);
        const cliente = await assertMismoTenant('cliente', data?.clienteId, tenantId);
        if (tenantId == null) tenantId = cliente?.concesionariaId ?? null;
        // Recién ahora, con el tenant fijado, el vehículo debe ser del MISMO tenant
        // (anti FK cross-tenant: bloquea que un super_admin cruce cliente y auto de tenants distintos).
        await assertMismoTenant('vehiculo', data?.vehiculoId, tenantId);
        return this.repository.create({ ...data, concesionariaId: tenantId });
    }
}
