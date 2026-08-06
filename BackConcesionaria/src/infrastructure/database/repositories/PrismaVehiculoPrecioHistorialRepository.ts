import { IVehiculoPrecioHistorialRepository } from '../../../domain/repositories/IVehiculoPrecioHistorialRepository';
import { VehiculoPrecioHistorial } from '../../../domain/entities/VehiculoPrecioHistorial';
import prisma from '../prisma';

const includeRefs = {
    usuario: { select: { id: true, nombre: true } },
};

export class PrismaVehiculoPrecioHistorialRepository implements IVehiculoPrecioHistorialRepository {
    async findByVehiculo(vehiculoId: number): Promise<VehiculoPrecioHistorial[]> {
        const rows = await prisma.vehiculoPrecioHistorial.findMany({
            where: { vehiculoId },
            orderBy: { createdAt: 'desc' },
            include: includeRefs,
        });
        return rows.map((r) => this.mapToEntity(r));
    }

    // Decimal de Prisma → number para el JSON de la API (mismo criterio que el
    // precioLista del vehículo en otros repos).
    private mapToEntity(r: any): VehiculoPrecioHistorial {
        return new VehiculoPrecioHistorial(
            r.id,
            r.concesionariaId,
            r.vehiculoId,
            r.precioAnterior == null ? null : Number(r.precioAnterior),
            Number(r.precioNuevo),
            r.moneda,
            r.motivo ?? null,
            r.usuarioId ?? null,
            r.createdAt,
            r.usuario,
        );
    }
}
