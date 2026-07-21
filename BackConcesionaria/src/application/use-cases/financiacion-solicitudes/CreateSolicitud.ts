import { ISolicitudFinanciacionRepository } from '../../../domain/repositories/ISolicitudFinanciacionRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';

/**
 * Verifica que el vehículo exista y sea de la concesionaria del token.
 * express-validator sólo chequea la forma del id; sin esto, un vehiculoId de
 * otro tenant pasaría, porque la FK sólo falla si el id no existe en TODA la
 * base. La extensión RLS inyecta el concesionariaId en el where, así que un
 * vehículo ajeno devuelve null acá.
 */
export async function assertVehiculoDelTenant(vehiculoId: unknown): Promise<void> {
    if (vehiculoId === undefined || vehiculoId === null) return;
    const vehiculo = await prisma.vehiculo.findUnique({ where: { id: Number(vehiculoId) } });
    if (!vehiculo) throw new NotFoundException('Vehículo');
}

export class CreateSolicitud {
    constructor(private readonly repository: ISolicitudFinanciacionRepository) { }

    async execute(data: any) {
        await assertVehiculoDelTenant(data?.vehiculoId);
        return this.repository.create(data);
    }
}
