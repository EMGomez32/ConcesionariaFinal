import { ITipoPostventaRepository } from '../../../domain/repositories/ITipoPostventaRepository';
import { TipoPostventa } from '../../../domain/entities/TipoPostventa';
import prisma from '../prisma';

// `concesionariaId` lo inyecta la extensión RLS desde el token: no se toma del body.
const EDITABLE = ['nombre', 'activo'] as const;

/** Clave de comparación: sin espacios sobrantes, sin mayúsculas y sin acentos. */
function normalizar(valor: string): string {
    return String(valor ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        // Quita los diacríticos que NFD separó de la letra base.
        .replace(/[̀-ͯ]/g, '');
}

function pickEditable(data: any = {}): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of EDITABLE) {
        if (data[key] === undefined) continue;
        out[key] = key === 'nombre' ? String(data[key]).trim() : data[key];
    }
    return out;
}

export class PrismaTipoPostventaRepository implements ITipoPostventaRepository {
    async findAll(concesionariaId: number): Promise<TipoPostventa[]> {
        const results = await prisma.tipoPostventa.findMany({
            where: { concesionariaId },
            orderBy: { nombre: 'asc' },
            // El ABM necesita saber cuántos casos usa cada tipo: es lo que decide
            // si se puede borrar o sólo archivar.
            include: { _count: { select: { casos: { where: { deletedAt: null } } } } },
        });
        return results.map(this.mapToEntity);
    }

    async findById(id: number): Promise<TipoPostventa | null> {
        const t = await prisma.tipoPostventa.findUnique({ where: { id } });
        return t ? this.mapToEntity(t) : null;
    }

    /**
     * Busca un tipo por nombre ignorando mayúsculas Y acentos.
     *
     * La comparación se hace en memoria y no en la query: `mode: 'insensitive'`
     * de Prisma resuelve las mayúsculas pero no los acentos, así que dejaba
     * pasar "MECANICA" junto a "Mecánica" — exactamente la variante que este
     * catálogo viene a evitar. Hacerlo en Postgres pediría la extensión
     * `unaccent`, que habría que instalar en la base de la Pi. El catálogo tiene
     * un puñado de filas por concesionaria, así que traerlas y comparar acá sale
     * gratis y no agrega una dependencia al deploy.
     */
    async findByNombre(nombre: string): Promise<TipoPostventa | null> {
        const buscado = normalizar(nombre);
        if (!buscado) return null;

        const todos = await prisma.tipoPostventa.findMany();
        const t = todos.find((x) => normalizar(x.nombre) === buscado);
        return t ? this.mapToEntity(t) : null;
    }

    async create(data: any): Promise<TipoPostventa> {
        const payload = pickEditable(data);
        // super_admin no recibe la inyección de concesionariaId del RLS: el
        // controller lo resuelve y acá se setea explícito, fuera de pickEditable.
        if (data.concesionariaId != null) {
            payload.concesionariaId = Number(data.concesionariaId);
        }
        const t = await prisma.tipoPostventa.create({ data: payload as any });
        return this.mapToEntity(t);
    }

    async update(id: number, data: any): Promise<TipoPostventa> {
        const t = await prisma.tipoPostventa.update({
            where: { id },
            data: pickEditable(data),
        });
        return this.mapToEntity(t);
    }

    async delete(id: number): Promise<void> {
        await prisma.tipoPostventa.delete({ where: { id } });
    }

    async countCasos(id: number): Promise<number> {
        return prisma.postventaCaso.count({ where: { tipoId: id } });
    }

    private mapToEntity(t: any): TipoPostventa {
        return new TipoPostventa(
            t.id,
            t.concesionariaId,
            t.nombre,
            t.activo,
            t.createdAt,
            t.updatedAt,
            t.deletedAt ?? null,
            t._count?.casos,
        );
    }
}
