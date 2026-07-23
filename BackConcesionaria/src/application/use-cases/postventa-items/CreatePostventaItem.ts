import { IPostventaItemRepository } from '../../../domain/repositories/IPostventaItemRepository';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';

export class CreatePostventaItem {
    constructor(private readonly repository: IPostventaItemRepository) { }

    async execute(data: any) {
        // El ítem cuelga de un caso y hereda su tenant (trigger de concesionaria_id).
        // Confirmar que el caso es del tenant del actor (ajeno → 404 para el admin) y
        // que el proveedor sea de esa misma concesionaria.
        const caso = await assertMismoTenant('postventaCaso', data?.casoId);
        await assertMismoTenant('proveedor', data?.proveedorId, caso?.concesionariaId);
        return this.repository.create(data);
    }
}
