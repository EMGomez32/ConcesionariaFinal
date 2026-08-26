import { ITasacionRepository } from '../../../domain/repositories/ITasacionRepository';
import { Tasacion } from '../../../domain/entities/Tasacion';
import prisma from '../prisma';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

// Campos que el cliente puede escribir. `concesionariaId` lo inyecta la extensión
// RLS (o lo setea el controller para super_admin); `tasadorId` lo estampa el use
// case desde el token. Whitelist = segunda barrera anti mass-assignment.
const EDITABLE = ['clienteId', 'tasadorId', 'marca', 'modelo', 'anio', 'km', 'dominio', 'condicion', 'valorEstimado', 'moneda', 'fecha', 'observaciones'] as const;
// Campos que se pueden tocar al ACTUALIZAR (tasar una pendiente). No incluye
// marca/modelo/fecha/clienteId: identifican la tasación y no se re-escriben acá.
// `estado` y `tasadorId` NO vienen del body: los deriva el use case, pero se
// escriben en la fila, así que van en la whitelist.
const EDITABLE_UPDATE = ['anio', 'km', 'dominio', 'condicion', 'valorEstimado', 'moneda', 'observaciones', 'estado', 'tasadorId'] as const;
// @db.Date: el <input type="date"> manda 'YYYY-MM-DD' y Prisma espera DateTime.
const DATE_KEYS = ['fecha'];

function pickFrom(whitelist: readonly string[], data: any = {}): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of whitelist) {
        if (data[key] === undefined) continue;
        out[key] = DATE_KEYS.includes(key) && data[key] !== null ? new Date(data[key]) : data[key];
    }
    return out;
}

const pickEditable = (data: any = {}) => pickFrom(EDITABLE, data);

const includeRefs = {
    cliente: { select: { id: true, nombre: true, telefono: true } },
    tasador: { select: { id: true, nombre: true } },
};

export class PrismaTasacionRepository implements ITasacionRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Tasacion>> {
        // Cota: sin esto ?limit=999999 trae toda la tabla (DoS) y ?page=-1 da un skip
        // negativo → PrismaClientValidationError → 500 (mismo clamp que Sucursal/Audit).
        const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
        const page = Math.max(Number(options.page) || 1, 1);

        const where: any = {};
        if (filter.search) {
            const q = String(filter.search);
            where.OR = [
                { marca: { contains: q, mode: 'insensitive' } },
                { modelo: { contains: q, mode: 'insensitive' } },
                { dominio: { contains: q, mode: 'insensitive' } },
                { cliente: { nombre: { contains: q, mode: 'insensitive' } } },
            ];
        }
        if (filter.condicion) where.condicion = filter.condicion;

        const [results, total] = await Promise.all([
            prisma.tasacion.findMany({
                where,
                take: limit,
                skip: (page - 1) * limit,
                orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
                include: includeRefs,
            }),
            prisma.tasacion.count({ where }),
        ]);

        return {
            results: results.map((r) => this.mapToEntity(r)),
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Tasacion | null> {
        const t = await prisma.tasacion.findUnique({ where: { id }, include: includeRefs });
        return t ? this.mapToEntity(t) : null;
    }

    async create(data: any): Promise<Tasacion> {
        const payload = pickEditable(data);
        // super_admin no recibe la inyección del RLS: el controller lo resuelve y acá
        // se setea explícito, fuera de la whitelist.
        if (data.concesionariaId != null) payload.concesionariaId = Number(data.concesionariaId);
        const t = await prisma.tasacion.create({ data: payload as any, include: includeRefs });
        return this.mapToEntity(t);
    }

    async update(id: number, data: any): Promise<Tasacion> {
        const t = await prisma.tasacion.update({
            where: { id },
            data: pickFrom(EDITABLE_UPDATE, data) as any,
            include: includeRefs,
        });
        return this.mapToEntity(t);
    }

    async delete(id: number): Promise<void> {
        // La extensión reescribe el delete a un soft-delete (Tasacion está en SOFT_DELETE_MODELS).
        await prisma.tasacion.delete({ where: { id } });
    }

    private mapToEntity(t: any): Tasacion {
        return new Tasacion(
            t.id,
            t.concesionariaId,
            t.clienteId ?? null,
            t.tasadorId ?? null,
            t.marca,
            t.modelo,
            t.anio ?? null,
            t.km ?? null,
            t.dominio ?? null,
            t.condicion,
            t.valorEstimado == null ? null : Number(t.valorEstimado),
            t.moneda,
            t.fecha,
            t.observaciones ?? null,
            t.createdAt,
            t.updatedAt,
            t.deletedAt ?? null,
            t.cliente,
            t.tasador,
        );
    }
}
