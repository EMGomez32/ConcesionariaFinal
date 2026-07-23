import { IGastoRepository } from '../../../domain/repositories/IGastoRepository';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';

export class CreateGasto {
    constructor(private readonly gastoRepository: IGastoRepository) { }

    async execute(data: any) {
        // El gasto cuelga de un vehículo y hereda su tenant. La categoría y el
        // proveedor del body tienen que ser de esa misma concesionaria: para el
        // admin una fila ajena da 404; para super_admin se rechaza el cruce.
        const vehiculo = await assertMismoTenant('vehiculo', data?.vehiculoId);
        const tenantId = vehiculo?.concesionariaId;
        await assertMismoTenant('categoriaGastoVehiculo', data?.categoriaId, tenantId);
        await assertMismoTenant('proveedor', data?.proveedorId, tenantId);
        return this.gastoRepository.create(data);
    }
}
