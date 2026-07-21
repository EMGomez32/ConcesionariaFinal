import { IPostventaCasoRepository } from '../../../domain/repositories/IPostventaCasoRepository';
import { PostventaCaso } from '../../../domain/entities/PostventaCaso';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

// Sólo se puede ordenar por columnas reales: `sortBy` viene de la query y
// pasarlo crudo a Prisma permite un 500 con cualquier valor inventado.
const SORTABLE = ['createdAt', 'updatedAt', 'fechaReclamo', 'fechaCierre', 'estado'];

// Campos que el cliente puede escribir. express-validator valida pero NO recorta:
// sin esta whitelist el resto del body llega crudo a Prisma. En update era un
// bypass de permisos concreto: el DELETE pide authorize('admin'), pero un PATCH
// con `{"deletedAt":"..."}` —abierto a vendedor y postventa— borraba el caso igual.
// `concesionariaId` lo inyecta la extensión RLS desde el token: nunca del body.
// `tipo` (texto libre) ya no se escribe: el tipo entra por `tipoId` contra el
// catálogo TipoPostventa. La columna vieja queda sólo como histórico.
const EDITABLE_CREATE = ['clienteId', 'vehiculoId', 'sucursalId', 'ventaId', 'fechaReclamo', 'tipoId', 'descripcion'] as const;
// `estado` sólo entra por acá: lo valida la máquina de estados en UpdateCaso.
const EDITABLE_UPDATE = ['estado', 'tipoId', 'descripcion', 'fechaReclamo', 'fechaCierre'] as const;

// @db.Date: el <input type="date"> manda 'YYYY-MM-DD' y Prisma espera DateTime.
const DATE_KEYS = ['fechaReclamo', 'fechaCierre'];

function pickEditable(data: any = {}, editable: readonly string[]): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of editable) {
        if (data[key] === undefined) continue;
        // fechaCierre es nullable: `new Date(null)` daría 1970, no null.
        out[key] = DATE_KEYS.includes(key) && data[key] !== null ? new Date(data[key]) : data[key];
    }
    return out;
}

export class PrismaPostventaCasoRepository implements IPostventaCasoRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<PostventaCaso>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);

        const where = coerceFilter(filter);
        const orderKey = SORTABLE.includes(String(sortBy)) ? String(sortBy) : 'createdAt';
        const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

        const results = await prisma.postventaCaso.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [orderKey]: orderDir },
            include: {
                cliente: true,
                vehiculo: true,
                sucursal: true,
                tipoRef: true,
                items: { where: { deletedAt: null } }
            }
        });

        const total = await prisma.postventaCaso.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<PostventaCaso | null> {
        const c = await prisma.postventaCaso.findUnique({
            where: { id },
            include: { cliente: true, vehiculo: true, sucursal: true, tipoRef: true, items: { where: { deletedAt: null } } }
        });
        return c ? this.mapToEntity(c) : null;
    }

    async create(data: any): Promise<PostventaCaso> {
        const c = await prisma.postventaCaso.create({
            data: {
                ...pickEditable(data, EDITABLE_CREATE),
                // Todo caso arranca pendiente: no se acepta del body.
                estado: 'pendiente'
            } as any,
            include: { tipoRef: true }
        });
        return this.mapToEntity(c);
    }

    async update(id: number, data: any): Promise<PostventaCaso> {
        const c = await prisma.postventaCaso.update({
            where: { id },
            data: pickEditable(data, EDITABLE_UPDATE),
        });
        return this.mapToEntity(c);
    }

    async delete(id: number): Promise<void> {
        await prisma.postventaCaso.delete({ where: { id } });
    }

    private mapToEntity(c: any): PostventaCaso {
        return new PostventaCaso(
            c.id,
            c.concesionariaId,
            c.sucursalId,
            c.clienteId,
            c.vehiculoId,
            c.ventaId,
            c.fechaReclamo,
            c.tipoId ?? null,
            // El nombre del catálogo gana; el texto libre es el fallback de los
            // casos históricos, previos al catálogo.
            c.tipoRef?.nombre ?? c.tipo ?? null,
            c.descripcion,
            c.estado,
            c.fechaCierre ?? null,
            c.createdAt,
            c.updatedAt,
            c.deletedAt ?? null,
            c.cliente,
            c.vehiculo,
            c.sucursal,
            c.items,
            c.tipoRef
        );
    }
}
