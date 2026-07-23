import { IPostventaCasoRepository } from '../../../domain/repositories/IPostventaCasoRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';

/**
 * Verifica que el tipo exista, sea de la concesionaria del token y esté activo.
 * express-validator sólo chequea la forma del id; sin esto, un tipoId de otro
 * tenant pasaría, porque la FK sólo falla si el id no existe en TODA la base.
 * La extensión RLS inyecta el concesionariaId en el where, así que un tipo ajeno
 * devuelve null acá.
 */
export async function assertTipoUsable(tipoId: unknown): Promise<void> {
    if (tipoId === undefined || tipoId === null) return;

    const tipo = await prisma.tipoPostventa.findUnique({ where: { id: Number(tipoId) } });
    if (!tipo) throw new NotFoundException('Tipo de postventa');

    // Un tipo archivado sigue visible en los casos viejos, pero no se puede
    // elegir en uno nuevo: para eso se archivó.
    if (!tipo.activo) {
        throw new BaseException(
            422,
            `El tipo "${tipo.nombre}" está archivado y no se puede asignar a un caso nuevo`,
            'TIPO_ARCHIVADO',
        );
    }
}

export class CreateCaso {
    constructor(private readonly repository: IPostventaCasoRepository) { }

    async execute(data: any) {
        await assertTipoUsable(data?.tipoId);
        // Cliente, vehículo, sucursal y venta del reclamo tienen que ser del tenant
        // destino: para el admin una fila ajena da 404; para super_admin se rechaza
        // el cruce contra la concesionaria destino.
        const tenantId = resolveTenantDestino(data?.concesionariaId);
        await assertMismoTenant('cliente', data?.clienteId, tenantId);
        await assertMismoTenant('vehiculo', data?.vehiculoId, tenantId);
        await assertMismoTenant('sucursal', data?.sucursalId, tenantId);
        await assertMismoTenant('venta', data?.ventaId, tenantId);
        return this.repository.create(data);
    }
}
