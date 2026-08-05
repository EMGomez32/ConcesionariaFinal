import { ITasacionRepository } from '../../../domain/repositories/ITasacionRepository';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';
import { context } from '../../../infrastructure/security/context';

export class CreateTasacion {
    constructor(private readonly repository: ITasacionRepository) { }

    async execute(data: any) {
        const tenantId = resolveTenantDestino(data?.concesionariaId);
        // El cliente (si se indica) debe ser del mismo tenant (anti FK cross-tenant).
        await assertMismoTenant('cliente', data?.clienteId, tenantId);
        // El tasador se estampa del usuario logueado, no del body.
        const tasadorId = context.getUser()?.userId ?? null;
        return this.repository.create({ ...data, tasadorId });
    }
}
