import { ICotizacionRepository } from '../../../domain/repositories/ICotizacionRepository';
import { Cotizacion } from '../../../domain/entities/Cotizacion';
import prisma from '../prisma';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

/**
 * Normaliza una fecha a la medianoche UTC de ese día. La columna es @db.Date:
 * si se guardara con hora local (UTC-3), Prisma trunca al día y una carga de las
 * 23:00 podría quedar en el día equivocado. En UTC puro el día es el día.
 */
function toDateOnly(v: any): Date {
    if (v instanceof Date) {
        return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
    }
    const s = String(v);
    // 'YYYY-MM-DD' → medianoche UTC. Con la Z explícita no se reinterpreta local.
    const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
    return d;
}

const SORTABLE = ['fecha', 'valor', 'createdAt', 'updatedAt'];

export class PrismaCotizacionRepository implements ICotizacionRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Cotizacion>> {
        const { limit = 20, page = 1, sortBy = 'fecha', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);

        const where: any = {};
        // Rango opcional por fecha (?desde=&hasta=), fechas puras en UTC.
        if (filter?.desde || filter?.hasta) {
            where.fecha = {};
            if (filter.desde) where.fecha.gte = toDateOnly(filter.desde);
            if (filter.hasta) where.fecha.lte = toDateOnly(filter.hasta);
        }

        const orderKey = SORTABLE.includes(String(sortBy)) ? String(sortBy) : 'fecha';
        const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

        const results = await prisma.cotizacion.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [orderKey]: orderDir },
        });
        const total = await prisma.cotizacion.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Cotizacion | null> {
        const c = await prisma.cotizacion.findUnique({ where: { id } });
        return c ? this.mapToEntity(c) : null;
    }

    async findByFecha(fecha: Date, concesionariaId?: number): Promise<Cotizacion | null> {
        const where: any = { fecha: toDateOnly(fecha) };
        // Para el super_admin (sin inyección de tenant) hay que acotar por tenant
        // a mano; para el admin la extensión ya lo inyecta en el where.
        if (concesionariaId != null) where.concesionariaId = Number(concesionariaId);
        const c = await prisma.cotizacion.findFirst({ where });
        return c ? this.mapToEntity(c) : null;
    }

    async findVigente(fecha?: Date, concesionariaId?: number): Promise<Cotizacion | null> {
        const where: any = {};
        if (fecha) where.fecha = { lte: toDateOnly(fecha) };
        if (concesionariaId != null) where.concesionariaId = Number(concesionariaId);
        const c = await prisma.cotizacion.findFirst({
            where,
            orderBy: { fecha: 'desc' },
        });
        return c ? this.mapToEntity(c) : null;
    }

    async upsertByFecha(data: any): Promise<Cotizacion> {
        const fecha = toDateOnly(data.fecha);
        const valor = Number(data.valor);
        const concesionariaId = data.concesionariaId != null ? Number(data.concesionariaId) : undefined;

        // Defensa en profundidad: el tenant destino es obligatorio. Un admin normal
        // siempre lo trae (resolveConcesionariaId → su token); el super_admin lo
        // elige por body y el controller ya corta si falta. Si aún así llegara
        // undefined (uso programático), un findFirst/create SIN scope de tenant
        // podría pisar la cotización de OTRA concesionaria: se falla explícito.
        if (concesionariaId === undefined) {
            throw new Error('upsertByFecha requiere concesionariaId (tenant destino)');
        }

        // No se usa prisma.upsert: la extensión RLS inyecta concesionariaId en el
        // `where` de nivel superior, lo que rompe el locator único del upsert. Con
        // find + create/update cada operación pasa limpia por la extensión.
        const existing = await this.findByFecha(fecha, concesionariaId);
        if (existing) {
            const updated = await prisma.cotizacion.update({
                where: { id: existing.id },
                data: { valor, fecha },
            });
            return this.mapToEntity(updated);
        }

        const payload: any = { fecha, valor };
        // El admin la recibe inyectada por la extensión; el super_admin la manda.
        if (concesionariaId != null) payload.concesionariaId = concesionariaId;
        const created = await prisma.cotizacion.create({ data: payload });
        return this.mapToEntity(created);
    }

    async delete(id: number): Promise<void> {
        // Dato de referencia, no soft-delete: borrado físico.
        await prisma.cotizacion.delete({ where: { id } });
    }

    private mapToEntity(c: any): Cotizacion {
        return new Cotizacion(
            c.id,
            c.concesionariaId,
            c.fecha,
            // Decimal de Prisma llega como string.
            Number(c.valor),
            c.createdAt,
            c.updatedAt,
        );
    }
}
