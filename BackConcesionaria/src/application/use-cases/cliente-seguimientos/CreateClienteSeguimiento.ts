import { IClienteSeguimientoRepository } from '../../../domain/repositories/IClienteSeguimientoRepository';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';
import { context } from '../../../infrastructure/security/context';

export class CreateClienteSeguimiento {
    constructor(private readonly repository: IClienteSeguimientoRepository) { }

    async execute(data: any) {
        // El clienteId llega por body: hay que garantizar que sea del mismo tenant, o
        // un admin podría anexar seguimientos al cliente de otra concesionaria.
        const tenantId = resolveTenantDestino(data?.concesionariaId);
        await assertMismoTenant('cliente', data?.clienteId, tenantId);
        // El autor del contacto se estampa del token, no se confía en el body: así el
        // registro queda atribuido al usuario logueado.
        const usuarioId = context.getUser()?.userId ?? null;
        return this.repository.create({ ...data, usuarioId });
    }
}
