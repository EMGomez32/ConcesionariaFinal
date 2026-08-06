import { IClienteRepository } from '../../../domain/repositories/IClienteRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';

export class UpdateCliente {
    constructor(private readonly clienteRepository: IClienteRepository) { }

    async execute(id: number, data: any) {
        const exists: any = await this.clienteRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Cliente');
        }
        // Sólo validamos el vendedor cuando se ASIGNA uno NUEVO (id no nulo distinto al
        // actual). Reenviar el mismo id (el form lo manda siempre) o desasignar (null)
        // no re-valida: si el vendedor se dio de baja DESPUÉS, no debe congelar la
        // edición del cliente con un 404 'Usuario' en cualquier cambio (teléfono, etapa…).
        if (data?.vendedorAsignadoId != null && Number(data.vendedorAsignadoId) !== (exists.vendedorAsignadoId ?? -1)) {
            await assertMismoTenant('usuario', data.vendedorAsignadoId, exists.concesionariaId);
        }
        return this.clienteRepository.update(id, data);
    }
}
