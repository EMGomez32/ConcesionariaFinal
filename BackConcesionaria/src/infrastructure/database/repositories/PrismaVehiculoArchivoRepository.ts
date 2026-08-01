import { IVehiculoArchivoRepository } from '../../../domain/repositories/IVehiculoArchivoRepository';
import { VehiculoArchivo } from '../../../domain/entities/VehiculoArchivo';
import prisma from '../prisma';
import { assertMismoTenant } from '../../security/tenantGuard';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class PrismaVehiculoArchivoRepository implements IVehiculoArchivoRepository {
    async findByVehiculo(vehiculoId: number): Promise<VehiculoArchivo[]> {
        const results = await prisma.vehiculoArchivo.findMany({
            where: { vehiculoId },
            // La principal primero (para que la UI la muestre arriba), luego por fecha.
            orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'desc' }],
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
        // una unidad de otra concesionaria. El uploadedById (endpoint JSON legacy)
        // también tiene que ser un usuario de ese tenant.
        const vehiculo = await assertMismoTenant('vehiculo', data?.vehiculoId);
        await assertMismoTenant('usuario', data?.uploadedById, vehiculo?.concesionariaId);
        const a = await prisma.vehiculoArchivo.create({ data });
        return this.mapToEntity(a);
    }

    async setPrincipal(id: number): Promise<VehiculoArchivo> {
        // Se lee el archivo (acotado por la extensión/RLS al tenant del actor) para
        // conocer su vehículo. Luego, dos operaciones a través del cliente extendido
        // (cada una scopeada por tenant): desmarcar los hermanos y marcar este.
        // A propósito NO se usa una transacción: la extensión RLS abre su propia
        // transacción por operación (setea app.tenant_id), y anidarlas complica el
        // scoping. La ventana entre ambas es inocua: si justo se lee, la ficha cae a
        // la primera foto (mismo fallback que cuando no hay principal).
        const archivo = await prisma.vehiculoArchivo.findFirst({ where: { id } });
        if (!archivo) throw new NotFoundException('Archivo');

        await prisma.vehiculoArchivo.updateMany({
            where: { vehiculoId: archivo.vehiculoId, esPrincipal: true },
            data: { esPrincipal: false },
        });
        const updated = await prisma.vehiculoArchivo.update({
            where: { id },
            data: { esPrincipal: true },
        });
        return this.mapToEntity(updated);
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
            a.esPrincipal ?? false,
            a.createdAt,
            a.updatedAt,
            a.deletedAt ?? null
        );
    }
}
