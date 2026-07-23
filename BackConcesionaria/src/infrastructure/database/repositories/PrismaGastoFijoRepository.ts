import { IGastoFijoRepository } from '../../../domain/repositories/IGastoFijoRepository';
import { GastoFijo } from '../../../domain/entities/GastoFijo';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

// `anio` y `mes` son columnas Int cuyo nombre no termina en `Id`: sin esto
// llegan como string desde la query y Prisma responde 500.
const NUMERIC_KEYS = ['anio', 'mes'];

// Campos que el cliente puede escribir. `concesionariaId` lo inyecta la
// extensión RLS desde el token, así que nunca se toma del body.
const EDITABLE = [
    'sucursalId', 'categoriaId', 'proveedorId',
    'anio', 'mes', 'descripcion', 'monto', 'moneda', 'comprobanteUrl',
] as const;

// Sólo se puede ordenar por columnas reales: `sortBy` viene de la query y
// pasarlo crudo a Prisma permite un 500 con cualquier valor inventado.
const SORTABLE = ['createdAt', 'updatedAt', 'anio', 'mes', 'monto', 'descripcion'];

function pickEditable(data: any = {}): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of EDITABLE) {
        if (data[key] === undefined) continue;
        out[key] = key === 'anio' || key === 'mes' ? Number(data[key]) : data[key];
    }
    return out;
}

export class PrismaGastoFijoRepository implements IGastoFijoRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<GastoFijo>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);

        const where = coerceFilter(filter, { numericKeys: NUMERIC_KEYS });
        const orderKey = SORTABLE.includes(String(sortBy)) ? String(sortBy) : 'createdAt';
        const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

        const results = await prisma.gastoFijo.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            // El período es la identidad del gasto fijo: se ordena por año/mes
            // antes que por el campo pedido, para que la grilla lea cronológica.
            orderBy: [{ anio: 'desc' }, { mes: 'desc' }, { [orderKey]: orderDir }],
            include: {
                categoria: true,
                sucursal: true,
                proveedor: true
            }
        });

        const total = await prisma.gastoFijo.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<GastoFijo | null> {
        const g = await prisma.gastoFijo.findUnique({
            where: { id },
            include: { categoria: true, sucursal: true, proveedor: true }
        });
        return g ? this.mapToEntity(g) : null;
    }

    async create(data: any): Promise<GastoFijo> {
        const payload = pickEditable(data);
        // super_admin no recibe la inyección de concesionariaId del RLS: el
        // controller lo resuelve y acá se setea explícito, fuera de pickEditable.
        if (data.concesionariaId != null) {
            payload.concesionariaId = Number(data.concesionariaId);
        }
        const g = await prisma.gastoFijo.create({
            data: payload as any,
            include: { categoria: true, sucursal: true, proveedor: true },
        });
        return this.mapToEntity(g);
    }

    async update(id: number, data: any): Promise<GastoFijo> {
        const g = await prisma.gastoFijo.update({
            where: { id },
            data: pickEditable(data),
            include: { categoria: true, sucursal: true, proveedor: true },
        });
        return this.mapToEntity(g);
    }

    async delete(id: number): Promise<void> {
        await prisma.gastoFijo.delete({ where: { id } });
    }

    private mapToEntity(g: any): GastoFijo {
        return new GastoFijo(
            g.id,
            g.concesionariaId,
            g.sucursalId ?? null,
            g.categoriaId,
            g.proveedorId ?? null,
            g.anio,
            g.mes,
            g.descripcion,
            // Decimal de Prisma llega como string.
            Number(g.monto),
            g.moneda ?? 'ARS',
            g.comprobanteUrl ?? null,
            g.createdAt,
            g.updatedAt,
            g.deletedAt ?? null,
            g.categoria,
            g.sucursal,
            g.proveedor
        );
    }
}
