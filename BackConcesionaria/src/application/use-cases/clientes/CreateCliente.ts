import { IClienteRepository } from '../../../domain/repositories/IClienteRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';

export class CreateCliente {
    constructor(private readonly clienteRepository: IClienteRepository) { }

    async execute(data: any) {
        if (!data.nombre) {
            throw new BaseException(400, 'El nombre es obligatorio', 'VALIDATION_ERROR');
        }
        // El vendedor asignado (si viene) debe ser un usuario del mismo tenant
        // (anti FK cross-tenant: la RLS valida la fila del cliente, no sus FKs).
        const tenantId = resolveTenantDestino(data?.concesionariaId);
        await assertMismoTenant('usuario', data?.vendedorAsignadoId, tenantId);
        // La fecha de asignación se estampa acá, no llega del body: es contra ella
        // que se mide la retención mientras no haya un contacto real posterior.
        // Sin esto, una ficha creada a mano con vendedor nacía sin reloj y caía al
        // pozo común de todos los vendedores del tenant desde el minuto cero.
        const vendedorAsignadoEn = data?.vendedorAsignadoId ? new Date() : undefined;
        return this.clienteRepository.create({ ...data, vendedorAsignadoEn });
    }
}
