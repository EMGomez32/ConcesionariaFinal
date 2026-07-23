import { IGastoFijoRepository } from '../../../domain/repositories/IGastoFijoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';

export class UpdateGastoFijo {
    constructor(private readonly repository: IGastoFijoRepository) { }

    async execute(id: number, data: any) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Gasto fijo');

        // El repo permite reasignar sucursal/categoría/proveedor: confinarlas al
        // tenant del gasto fijo para que un update no las cambie por filas ajenas.
        const tenantId = exists.concesionariaId;
        await assertMismoTenant('sucursal', data?.sucursalId, tenantId);
        await assertMismoTenant('categoriaGastoFijo', data?.categoriaId, tenantId);
        await assertMismoTenant('proveedor', data?.proveedorId, tenantId);

        return this.repository.update(id, data);
    }
}
