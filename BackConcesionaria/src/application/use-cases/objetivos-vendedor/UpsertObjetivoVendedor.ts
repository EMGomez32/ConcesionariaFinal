import { IObjetivoVendedorRepository } from '../../../domain/repositories/IObjetivoVendedorRepository';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';

export class UpsertObjetivoVendedor {
    constructor(private readonly repository: IObjetivoVendedorRepository) { }

    async execute(data: any) {
        // El vendedorId llega por body: hay que garantizar que sea un usuario del
        // mismo tenant, o un admin podría fijarle un objetivo a un vendedor ajeno
        // (mismo guard que usan GastoFijo/Venta para sus FKs).
        const tenantId = resolveTenantDestino(data?.concesionariaId);
        await assertMismoTenant('usuario', data?.vendedorId, tenantId);
        return this.repository.upsertByPeriodo(data);
    }
}
