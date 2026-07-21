import { ICategoriaGastoFijoRepository } from '../../../domain/repositories/ICategoriaGastoFijoRepository';
import { CategoriaGastoFijo } from '../../../domain/entities/CategoriaGastoFijo';
import prisma from '../prisma';

// `concesionariaId` lo inyecta la extensión RLS desde el token: no se toma del body.
const EDITABLE = ['nombre', 'activo'] as const;

function pickEditable(data: any = {}): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of EDITABLE) {
        if (data[key] !== undefined) out[key] = data[key];
    }
    return out;
}

export class PrismaCategoriaGastoFijoRepository implements ICategoriaGastoFijoRepository {
    async findAll(concesionariaId: number): Promise<CategoriaGastoFijo[]> {
        const results = await prisma.categoriaGastoFijo.findMany({
            where: { concesionariaId },
            orderBy: { nombre: 'asc' }
        });
        return results.map(this.mapToEntity);
    }

    async findById(id: number): Promise<CategoriaGastoFijo | null> {
        const c = await prisma.categoriaGastoFijo.findUnique({ where: { id } });
        return c ? this.mapToEntity(c) : null;
    }

    async create(data: any): Promise<CategoriaGastoFijo> {
        const c = await prisma.categoriaGastoFijo.create({ data: pickEditable(data) as any });
        return this.mapToEntity(c);
    }

    async update(id: number, data: any): Promise<CategoriaGastoFijo> {
        const c = await prisma.categoriaGastoFijo.update({
            where: { id },
            data: pickEditable(data),
        });
        return this.mapToEntity(c);
    }

    async delete(id: number): Promise<void> {
        await prisma.categoriaGastoFijo.delete({ where: { id } });
    }

    async countGastosFijos(id: number): Promise<number> {
        return prisma.gastoFijo.count({ where: { categoriaId: id } });
    }

    private mapToEntity(c: any): CategoriaGastoFijo {
        return new CategoriaGastoFijo(
            c.id, c.concesionariaId, c.nombre, c.activo,
            c.createdAt, c.updatedAt, c.deletedAt ?? null
        );
    }
}
