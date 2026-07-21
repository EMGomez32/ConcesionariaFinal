import { IPostventaItemRepository } from '../../../domain/repositories/IPostventaItemRepository';
import { PostventaItem } from '../../../domain/entities/PostventaItem';
import prisma from '../prisma';

// `concesionariaId` lo inyecta la extensión RLS desde el token: no se toma del body.
const EDITABLE = ['casoId', 'fecha', 'descripcion', 'monto', 'proveedorId', 'comprobanteUrl'] as const;

function pickEditable(data: any = {}): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of EDITABLE) {
        if (data[key] === undefined) continue;
        // El <input type="date"> manda 'YYYY-MM-DD'; Prisma espera DateTime.
        out[key] = key === 'fecha' ? new Date(data[key]) : data[key];
    }
    return out;
}

export class PrismaPostventaItemRepository implements IPostventaItemRepository {
    async findByCaso(casoId: number): Promise<PostventaItem[]> {
        const results = await prisma.postventaItem.findMany({
            where: { casoId },
            orderBy: { fecha: 'asc' },
            include: { proveedor: true },
        });
        return results.map(this.mapToEntity);
    }

    async findById(id: number): Promise<PostventaItem | null> {
        const i = await prisma.postventaItem.findUnique({
            where: { id },
            include: { proveedor: true },
        });
        return i ? this.mapToEntity(i) : null;
    }

    async create(data: any): Promise<PostventaItem> {
        const i = await prisma.postventaItem.create({
            data: pickEditable(data) as any,
            include: { proveedor: true },
        });
        return this.mapToEntity(i);
    }

    async delete(id: number): Promise<void> {
        await prisma.postventaItem.delete({ where: { id } });
    }

    private mapToEntity(i: any): PostventaItem {
        return new PostventaItem(
            i.id,
            i.casoId,
            i.fecha,
            i.descripcion,
            // Decimal de Prisma llega como string.
            Number(i.monto),
            i.proveedorId ?? null,
            i.comprobanteUrl ?? null,
            i.createdAt,
            i.updatedAt,
            i.deletedAt ?? null,
            i.proveedor
        );
    }
}
