import { IVentaRepository } from '../../../domain/repositories/IVentaRepository';
import { Venta } from '../../../domain/entities/Venta';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions, PaginatedResponse } from '../../../types/common';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertMismoTenant } from '../../security/tenantGuard';
import { USUARIO_PUBLICO, VEHICULO_PUBLICO } from '../proyecciones';
import { parsePagination, parseOrderBy } from '../queryOptions';
import { whereDeBusqueda, clienteCoincide, vehiculoCoincide, rangoDeFechas } from '../busqueda';

export class PrismaVentaRepository implements IVentaRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Venta>> {
        const { sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const { limit: limitNum, page: pageNum } = parsePagination(options);
        // q y el rango no son columnas: fuera del filtro antes de coerceFilter (ver busqueda.ts).
        const { q, fechaDesde, fechaHasta, ...resto } = filter ?? {};
        const where = coerceFilter(resto);

        const busqueda = whereDeBusqueda(q, (t) => [
            { cliente: clienteCoincide(t) },
            { vehiculo: vehiculoCoincide(t) },
        ]);
        if (busqueda) where.AND = busqueda;

        // "Ventas del mes": fechaVenta es @db.Date, el rango es inclusivo en ambas puntas.
        const rango = rangoDeFechas(fechaDesde, fechaHasta);
        if (rango) where.fechaVenta = rango;

        const results = await prisma.venta.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: parseOrderBy('Venta', sortBy, sortOrder, 'createdAt'),
            include: {
                cliente: true,
                vehiculo: { select: VEHICULO_PUBLICO },
                vendedor: { select: USUARIO_PUBLICO }
            }
        });

        const total = await prisma.venta.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Venta | null> {
        const v = await prisma.venta.findUnique({
            where: { id },
            include: {
                cliente: true,
                vehiculo: { select: VEHICULO_PUBLICO },
                extras: { where: { deletedAt: null } },
                pagos: { where: { deletedAt: null } },
                canjes: { where: { deletedAt: null } },
                vendedor: { select: USUARIO_PUBLICO },
                presupuesto: true
            }
        });
        return v ? this.mapToEntity(v) : null;
    }

    /**
     * Reporte de anulaciones. Va por el cliente extendido (tenant inyectado por la
     * extensión, super_admin ve todo) con `deletedAt: { not: null }` EXPLÍCITO: la
     * extensión sólo agrega `deletedAt: null` cuando el where no lo menciona.
     *
     * Proyección cerrada a propósito (VEHICULO_PUBLICO / USUARIO_PUBLICO, cliente
     * con nombre y documento): es un listado y el centinela de lecturas no deja
     * pasar includes anchos. Filtros: rango por FECHA DE ANULACIÓN (fechaDesde /
     * fechaHasta, YYYY-MM-DD inclusive) y vendedor.
     */
    async findAnuladas(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<any>> {
        const { limit: limitNum, page: pageNum } = parsePagination(options);
        const where: any = { deletedAt: { not: null } };
        const { fechaDesde, fechaHasta, vendedorId } = filter ?? {};
        if (vendedorId && Number.isInteger(Number(vendedorId))) where.vendedorId = Number(vendedorId);
        const desde = typeof fechaDesde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaDesde) ? new Date(`${fechaDesde}T00:00:00.000Z`) : null;
        const hasta = typeof fechaHasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaHasta) ? new Date(`${fechaHasta}T23:59:59.999Z`) : null;
        if (desde || hasta) where.deletedAt = { not: null, ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) };

        const results = await prisma.venta.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { deletedAt: 'desc' },
            select: {
                id: true,
                concesionariaId: true,
                fechaVenta: true,
                precioVenta: true,
                moneda: true,
                formaPago: true,
                estadoEntrega: true,
                deletedAt: true,
                motivoAnulacion: true,
                cliente: { select: { id: true, nombre: true, dni: true } },
                vehiculo: { select: VEHICULO_PUBLICO },
                vendedor: { select: USUARIO_PUBLICO },
                anuladaPor: { select: USUARIO_PUBLICO },
            },
        });
        const total = await prisma.venta.count({ where });

        return {
            results: results.map(({ deletedAt, ...v }) => ({ ...v, anuladaEn: deletedAt })),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async create(data: any): Promise<Venta> {
        const v = await prisma.venta.create({ data });
        return this.mapToEntity(v);
    }

    async createWithTransaction(data: any, tx: any): Promise<Venta> {
        const v = await tx.venta.create({ data });
        return this.mapToEntity(v);
    }

    async update(id: number, data: any): Promise<Venta> {
        const v = await prisma.venta.update({
            where: { id },
            data,
        });
        return this.mapToEntity(v);
    }

    async delete(id: number): Promise<void> {
        await prisma.venta.delete({ where: { id } });
    }

    // Pagos
    async listPagos(ventaId: number): Promise<any[]> {
        return prisma.ventaPago.findMany({ where: { ventaId }, orderBy: { fecha: 'desc' } });
    }

    async addPago(ventaId: number, data: any): Promise<any> {
        return prisma.ventaPago.create({ data: { ...data, ventaId } });
    }

    // `deleteMany` y no `delete`: ata el sub-recurso a SU venta. Con `delete({ where:
    // { id } })` el :id de la venta que viaja en el path era decorativo y se podía
    // borrar el renglón de cualquier otra venta del tenant pasando un ventaId
    // inventado. La extensión reescribe deleteMany como updateMany de deletedAt
    // (soft delete) y le inyecta el concesionariaId, igual que a delete.
    async removePago(ventaId: number, pagoId: number): Promise<void> {
        const { count } = await prisma.ventaPago.deleteMany({ where: { id: pagoId, ventaId } });
        if (count === 0) throw new NotFoundException('Pago de la venta');
    }

    // Extras
    async listExtras(ventaId: number): Promise<any[]> {
        return prisma.ventaExtra.findMany({ where: { ventaId } });
    }

    async addExtra(ventaId: number, data: any): Promise<any> {
        return prisma.ventaExtra.create({ data: { ...data, ventaId } });
    }

    async removeExtra(ventaId: number, extraId: number): Promise<void> {
        const { count } = await prisma.ventaExtra.deleteMany({ where: { id: extraId, ventaId } });
        if (count === 0) throw new NotFoundException('Extra de la venta');
    }

    // Canjes
    async listCanjes(ventaId: number): Promise<any[]> {
        return prisma.ventaCanjeVehiculo.findMany({ where: { ventaId } });
    }

    async addCanje(ventaId: number, data: any): Promise<any> {
        // Este endpoint (POST /ventas/:id/canjes) no pasa por CreateVenta. El
        // vehiculoCanjeId del body tiene que ser del tenant de la venta: si no, un
        // admin podría tomar en canje un vehículo de otra concesionaria. La venta
        // se busca con el prisma extendido (ajena → 404 para el admin) y su tenant
        // es la referencia para comparar (cubre super_admin).
        const venta = await prisma.venta.findUnique({ where: { id: ventaId } });
        if (!venta) throw new NotFoundException('Venta');
        await assertMismoTenant('vehiculo', data?.vehiculoCanjeId, (venta as any).concesionariaId);
        return prisma.ventaCanjeVehiculo.create({ data: { ...data, ventaId } });
    }

    async removeCanje(ventaId: number, canjeId: number): Promise<void> {
        const { count } = await prisma.ventaCanjeVehiculo.deleteMany({ where: { id: canjeId, ventaId } });
        if (count === 0) throw new NotFoundException('Canje de la venta');
    }

    private mapToEntity(v: any): Venta {
        return new Venta(
            v.id,
            v.concesionariaId,
            v.sucursalId,
            v.vehiculoId,
            v.clienteId,
            v.vendedorId,
            v.fechaVenta,
            Number(v.precioVenta),
            v.moneda,
            v.formaPago,
            v.estadoEntrega,
            v.fechaEntrega,
            v.observaciones ?? null,
            v.presupuestoId ?? null,
            v.createdAt,
            v.updatedAt,
            v.deletedAt,
            v.cliente,
            v.vehiculo,
            v.vendedor,
            v.extras,
            v.pagos,
            v.canjes
        );
    }
}
