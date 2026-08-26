import { IClienteSeguimientoRepository } from '../../../domain/repositories/IClienteSeguimientoRepository';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';
import { context } from '../../../infrastructure/security/context';
import { tocarUltimaInteraccion } from '../../services/carteraCliente';

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
        const creado = await this.repository.create({ ...data, usuarioId });
        // REGISTRAR UN SEGUIMIENTO ES UN CONTACTO REAL, y por lo tanto renueva la
        // retención de la asignación. Lo dice el contrato de `tocarUltimaInteraccion`
        // y hasta acá no lo llamaba nadie: un vendedor que trabajaba a su cliente
        // por teléfono lo perdía igual a los 30 días, porque el reloj sólo lo movía
        // el mostrador. Va DESPUÉS del create y sin tumbar la operación si el
        // cliente no existe (`updateMany` sobre 0 filas).
        if (data?.clienteId) await tocarUltimaInteraccion(Number(data.clienteId));
        return creado;
    }
}
