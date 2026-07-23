import { ICategoriaGastoRepository } from '../../../domain/repositories/ICategoriaGastoRepository';
import { CategoriaGasto } from '../../../domain/entities/CategoriaGasto';
import prisma from '../prisma';

export class PrismaCategoriaGastoRepository implements ICategoriaGastoRepository {
    async findAll(concesionariaId: number, filter: any = {}): Promise<CategoriaGasto[]> {
        const where: any = { concesionariaId };
        if (filter.activo !== undefined) {
            where.activo = filter.activo === true || filter.activo === 'true';
        }
        const results = await prisma.categoriaGastoVehiculo.findMany({
            where,
            orderBy: { nombre: 'asc' }
        });
        return results.map(this.mapToEntity);
    }

    async findById(id: number): Promise<CategoriaGasto | null> {
        const c = await prisma.categoriaGastoVehiculo.findUnique({ where: { id } });
        return c ? this.mapToEntity(c) : null;
    }

    async create(data: any): Promise<CategoriaGasto> {
        // Whitelist: el body llega crudo del cliente; sólo aceptamos campos
        // editables para evitar mass-assignment (deletedAt, createdAt, etc.).
        const payload: any = { nombre: String(data.nombre ?? '').trim() };
        if (data.descripcion !== undefined) {
            payload.descripcion = data.descripcion ? String(data.descripcion).trim() : null;
        }
        if (data.activo !== undefined) payload.activo = Boolean(data.activo);
        // super_admin no recibe la inyección de concesionariaId del RLS: el
        // controller lo resuelve y acá se setea explícito.
        if (data.concesionariaId != null) payload.concesionariaId = Number(data.concesionariaId);

        const c = await prisma.categoriaGastoVehiculo.create({ data: payload });
        return this.mapToEntity(c);
    }

    async update(id: number, data: any): Promise<CategoriaGasto> {
        const payload: any = {};
        if (data.nombre !== undefined) payload.nombre = String(data.nombre).trim();
        if (data.descripcion !== undefined) {
            payload.descripcion = data.descripcion ? String(data.descripcion).trim() : null;
        }
        if (data.activo !== undefined) payload.activo = Boolean(data.activo);

        const c = await prisma.categoriaGastoVehiculo.update({
            where: { id },
            data: payload,
        });
        return this.mapToEntity(c);
    }

    async delete(id: number): Promise<void> {
        await prisma.categoriaGastoVehiculo.delete({ where: { id } });
    }

    async countGastos(id: number): Promise<number> {
        return prisma.gastoVehiculo.count({ where: { categoriaId: id } });
    }

    private mapToEntity(c: any): CategoriaGasto {
        return new CategoriaGasto(
            c.id,
            c.concesionariaId,
            c.nombre,
            c.descripcion ?? null,
            c.activo ?? true,
            c.createdAt,
            c.updatedAt,
            c.deletedAt
        );
    }
}
