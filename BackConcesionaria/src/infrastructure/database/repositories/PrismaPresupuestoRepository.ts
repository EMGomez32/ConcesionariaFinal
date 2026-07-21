import { IPresupuestoRepository } from '../../../domain/repositories/IPresupuestoRepository';
import { Presupuesto } from '../../../domain/entities/Presupuesto';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

export class PrismaPresupuestoRepository implements IPresupuestoRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Presupuesto>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);

        const where = coerceFilter(filter);


        const results = await prisma.presupuesto.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [sortBy as string]: sortOrder },
            include: {
                cliente: true,
                sucursal: true,
                vendedor: { select: { nombre: true, email: true } },
                // extras y canje entran en el total: sin ellos la lista mostraría
                // un importe distinto al del detalle.
                items: { where: { deletedAt: null }, include: { vehiculo: true } },
                extras: { where: { deletedAt: null } },
                canje: { where: { deletedAt: null } }
            }
        });

        const total = await prisma.presupuesto.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Presupuesto | null> {
        const p = await prisma.presupuesto.findUnique({
            where: { id },
            include: {
                cliente: true,
                sucursal: true,
                // El detalle lista cada unidad cotizada por marca/modelo, no por id.
                items: { where: { deletedAt: null }, include: { vehiculo: true } },
                extras: { where: { deletedAt: null } },
                canje: { where: { deletedAt: null } },
                vendedor: true
            }
        });
        return p ? this.mapToEntity(p) : null;
    }

    async create(data: any): Promise<Presupuesto> {
        const { items, externos, canjes, canje, ...presupuestoData } = data;
        const canjeData = canjes || canje;

        // Las fechas son @db.Date: Prisma 7 rechaza el string "YYYY-MM-DD".
        if (presupuestoData.fechaCreacion) presupuestoData.fechaCreacion = new Date(presupuestoData.fechaCreacion);
        if (presupuestoData.validoHasta) presupuestoData.validoHasta = new Date(presupuestoData.validoHasta);

        const p = await prisma.presupuesto.create({
            data: {
                ...presupuestoData,
                estado: 'borrador',
                items: { create: items || [] },
                extras: { create: externos || [] },
                ...(canjeData ? { canje: { create: canjeData } } : {})
            }
        });
        // Se relee con las relaciones para devolver los totales ya calculados.
        return this.findById(p.id) as Promise<Presupuesto>;
    }

    async update(id: number, data: any): Promise<Presupuesto> {
        // Whitelist: el body llega crudo del cliente. Los ítems/extras/canje se
        // manejan aparte, no por acá.
        const CAMPOS = ['estado', 'observaciones', 'validoHasta', 'moneda', 'pdfUrl', 'sucursalId', 'clienteId', 'vendedorId'];
        const payload: Record<string, any> = {};
        for (const campo of CAMPOS) {
            if (data[campo] !== undefined) payload[campo] = data[campo];
        }
        if (payload.validoHasta) payload.validoHasta = new Date(payload.validoHasta);

        await prisma.presupuesto.update({ where: { id }, data: payload });
        // Se relee con las relaciones: sin ellas mapToEntity calcularía total 0.
        return this.findById(id) as Promise<Presupuesto>;
    }

    async delete(id: number): Promise<void> {
        await prisma.presupuesto.delete({ where: { id } });
    }

    async countByYearAndConcesionaria(year: number, concesionariaId: number): Promise<number> {
        const start = new Date(year, 0, 1);
        const end = new Date(year + 1, 0, 1);
        return prisma.presupuesto.count({
            where: {
                concesionariaId,
                createdAt: { gte: start, lt: end },
            },
        });
    }

    private mapToEntity(p: any): Presupuesto {
        // subtotal y total no son columnas: se derivan de items + extras - canje,
        // la misma fórmula que expone GET /presupuestos/:id/total. Los Decimal de
        // Prisma llegan como string, así que hay que castearlos antes de sumar.
        const items = p.items ?? [];
        const extras = p.extras ?? [];
        const subtotalItems = items.reduce((s: number, i: any) => s + Number(i.precioFinal ?? 0), 0);
        const subtotalExtras = extras.reduce((s: number, e: any) => s + Number(e.monto ?? 0), 0);
        const valorCanje = Number(p.canje?.valorTomado ?? 0);
        const subtotal = subtotalItems + subtotalExtras;

        return {
            id: p.id,
            concesionariaId: p.concesionariaId,
            sucursalId: p.sucursalId,
            clienteId: p.clienteId,
            vendedorId: p.vendedorId,
            nroPresupuesto: p.nroPresupuesto,
            fechaCreacion: p.fechaCreacion,
            validoHasta: p.validoHasta ?? null,
            estado: p.estado,
            moneda: p.moneda ?? 'ARS',
            observaciones: p.observaciones ?? null,
            pdfUrl: p.pdfUrl ?? null,
            subtotal,
            total: subtotal - valorCanje,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            deletedAt: p.deletedAt,
            cliente: p.cliente ?? null,
            sucursal: p.sucursal ?? null,
            vendedor: p.vendedor ?? null,
            items,
            extras,
            canje: p.canje ?? null,
        } as unknown as Presupuesto;
    }
}
