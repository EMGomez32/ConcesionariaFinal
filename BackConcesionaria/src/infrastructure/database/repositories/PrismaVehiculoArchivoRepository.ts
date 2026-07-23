import { IVehiculoArchivoRepository } from '../../../domain/repositories/IVehiculoArchivoRepository';
import { VehiculoArchivo } from '../../../domain/entities/VehiculoArchivo';
import prisma from '../prisma';
import { assertMismoTenant } from '../../security/tenantGuard';

export class PrismaVehiculoArchivoRepository implements IVehiculoArchivoRepository {
    async findByVehiculo(vehiculoId: number): Promise<VehiculoArchivo[]> {
        const results = await prisma.vehiculoArchivo.findMany({
            where: { vehiculoId },
            orderBy: { createdAt: 'desc' },
        });
        return results.map(this.mapToEntity);
    }

    async findById(id: number): Promise<VehiculoArchivo | null> {
        const a = await prisma.vehiculoArchivo.findUnique({ where: { id } });
        return a ? this.mapToEntity(a) : null;
    }

    async create(data: any): Promise<VehiculoArchivo> {
        // El archivo cuelga de un vehículo y hereda su tenant (trigger de
        // concesionaria_id). Confirmar que el vehículo es del tenant del actor:
        // para el admin un vehiculoId ajeno da 404 en vez de adjuntar el archivo a
        // una unidad de otra concesionaria.
        await assertMismoTenant('vehiculo', data?.vehiculoId);
        const a = await prisma.vehiculoArchivo.create({ data });
        return this.mapToEntity(a);
    }

    async delete(id: number): Promise<void> {
        await prisma.vehiculoArchivo.delete({ where: { id } });
    }

    private mapToEntity(a: any): VehiculoArchivo {
        return new VehiculoArchivo(
            a.id,
            a.vehiculoId,
            a.url,
            a.tipo ?? null,
            a.descripcion ?? null,
            a.originalName ?? null,
            a.mimeType ?? null,
            a.sizeBytes ?? null,
            a.storageKey ?? null,
            a.uploadedById ?? null,
            a.createdAt,
            a.updatedAt,
            a.deletedAt ?? null
        );
    }
}
