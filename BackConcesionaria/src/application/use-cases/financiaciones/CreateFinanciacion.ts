import { IFinanciacionRepository } from '../../../domain/repositories/IFinanciacionRepository';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';

export class CreateFinanciacion {
    constructor(private readonly repository: IFinanciacionRepository) { }

    async execute(data: any) {
        // La financiación cuelga de una venta y hereda su tenant. La venta y el
        // cliente del body tienen que ser de esa concesionaria: para un admin la
        // fila ajena da 404; para super_admin se compara la concesionaria destino.
        const venta = await assertMismoTenant('venta', data.ventaId, resolveTenantDestino(data.concesionariaId));
        const tenantId = venta?.concesionariaId ?? resolveTenantDestino(data.concesionariaId);
        await assertMismoTenant('cliente', data.clienteId, tenantId);
        // cobradorId es un Usuario opcional: si viene, del mismo tenant.
        await assertMismoTenant('usuario', data.cobradorId, tenantId);
        // Tenant EXPLÍCITO derivado de la venta (no del body): así el contrato queda
        // siempre atado al tenant de su venta y no depende de que el body traiga un
        // concesionariaId (un super_admin sin ese campo dejaba concesionaria_id NULL →
        // financiaciones.concesionaria_id es NOT NULL sin trigger → 500).
        return this.repository.create({ ...data, concesionariaId: tenantId });
    }
}
