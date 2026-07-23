import { IGastoRepository } from '../../../domain/repositories/IGastoRepository';
import { Gasto } from '../../../domain/entities/Gasto';
import prisma from '../prisma';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

export class PrismaGastoRepository implements IGastoRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Gasto>> {
        const limit = Number(options.limit) || 20;
        const page = Number(options.page) || 1;
        const sortBy = options.sortBy || 'createdAt';
        const sortOrder = options.sortOrder || 'desc';

        // El frontend manda filtros con nombres que no son columnas del modelo
        // (tipo, sucursalId) o que requieren traducción. Sólo dejamos pasar los
        // que existen realmente en gastos_vehiculo para no romper Prisma.
        const where: any = {};
        if (filter.vehiculoId) where.vehiculoId = Number(filter.vehiculoId);
        if (filter.categoriaId) where.categoriaId = Number(filter.categoriaId);
        if (filter.proveedorId) where.proveedorId = Number(filter.proveedorId);
        // La "sede" del gasto es la del vehículo asociado.
        if (filter.sucursalId) where.vehiculo = { sucursalId: Number(filter.sucursalId) };
        if (filter.descripcion) where.descripcion = { contains: String(filter.descripcion), mode: 'insensitive' };
        // `tipo` (VEHICULO/FIJO) no existe en este modelo: se ignora.

        const results = await prisma.gastoVehiculo.findMany({
            where,
            take: limit,
            skip: (page - 1) * limit,
            orderBy: { [sortBy as string]: sortOrder },
            include: {
                categoria: true,
                vehiculo: { include: { sucursal: true } },
                proveedor: true
            }
        });

        const total = await prisma.gastoVehiculo.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Gasto | null> {
        const g = await prisma.gastoVehiculo.findUnique({
            where: { id },
            include: {
                categoria: true,
                vehiculo: { include: { sucursal: true } },
                proveedor: true
            }
        });
        return g ? this.mapToEntity(g) : null;
    }

    async create(data: any): Promise<Gasto> {
        // El frontend envía fechaGasto/tipo/sucursalId/urlComprobante; se
        // traducen a las columnas reales y se descartan los campos inexistentes.
        const fechaRaw = data.fecha ?? data.fechaGasto;
        const payload: any = {
            vehiculoId: Number(data.vehiculoId),
            categoriaId: Number(data.categoriaId),
            monto: data.monto,
            moneda: data.moneda || 'ARS',
            fecha: fechaRaw ? new Date(fechaRaw) : new Date(),
            descripcion: data.descripcion ?? null,
        };
        if (data.proveedorId) payload.proveedorId = Number(data.proveedorId);
        const comprobante = data.comprobanteUrl ?? data.urlComprobante;
        if (comprobante) payload.comprobanteUrl = comprobante;
        // super_admin no recibe la inyección de concesionariaId del RLS: el
        // controller lo resuelve y acá se setea explícito.
        if (data.concesionariaId != null) payload.concesionariaId = Number(data.concesionariaId);

        const g = await prisma.gastoVehiculo.create({ data: payload });
        return this.findById(g.id) as Promise<Gasto>;
    }

    async update(id: number, data: any): Promise<Gasto> {
        const payload: any = {};
        if (data.monto !== undefined) payload.monto = data.monto;
        if (data.descripcion !== undefined) payload.descripcion = data.descripcion;
        if (data.moneda !== undefined) payload.moneda = data.moneda;
        if (data.categoriaId !== undefined) payload.categoriaId = Number(data.categoriaId);
        if (data.proveedorId !== undefined) payload.proveedorId = data.proveedorId ? Number(data.proveedorId) : null;
        const fechaRaw = data.fecha ?? data.fechaGasto;
        if (fechaRaw !== undefined) payload.fecha = fechaRaw ? new Date(fechaRaw) : undefined;
        const comprobante = data.comprobanteUrl ?? data.urlComprobante;
        if (comprobante !== undefined) payload.comprobanteUrl = comprobante;

        await prisma.gastoVehiculo.update({ where: { id }, data: payload });
        return this.findById(id) as Promise<Gasto>;
    }

    async delete(id: number): Promise<void> {
        await prisma.gastoVehiculo.delete({ where: { id } });
    }

    private mapToEntity(g: any): Gasto {
        // Devolvemos un objeto plano con los nombres que espera el frontend
        // (fechaGasto, urlComprobante, sucursal) además de los reales.
        return {
            id: g.id,
            concesionariaId: g.concesionariaId,
            vehiculoId: g.vehiculoId,
            categoriaId: g.categoriaId,
            proveedorId: g.proveedorId ?? null,
            monto: Number(g.monto),
            moneda: g.moneda ?? 'ARS',
            descripcion: g.descripcion ?? null,
            fecha: g.fecha,
            fechaGasto: g.fecha,
            comprobanteUrl: g.comprobanteUrl ?? null,
            urlComprobante: g.comprobanteUrl ?? null,
            sucursalId: g.vehiculo?.sucursalId ?? null,
            sucursal: g.vehiculo?.sucursal ?? null,
            categoria: g.categoria ?? null,
            vehiculo: g.vehiculo ?? null,
            proveedor: g.proveedor ?? null,
            createdAt: g.createdAt,
            updatedAt: g.updatedAt,
        } as any as Gasto;
    }
}
