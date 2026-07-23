import { IVentaRepository } from '../../../domain/repositories/IVentaRepository';
import { Venta } from '../../../domain/entities/Venta';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions, PaginatedResponse } from '../../../types/common';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertMismoTenant } from '../../security/tenantGuard';

export class PrismaVentaRepository implements IVentaRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Venta>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);
        const where = coerceFilter(filter);

        const results = await prisma.venta.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [sortBy as string]: sortOrder },
            include: {
                cliente: true,
                vehiculo: true,
                vendedor: { select: { nombre: true, email: true } }
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
                vehiculo: true,
                extras: { where: { deletedAt: null } },
                pagos: { where: { deletedAt: null } },
                canjes: { where: { deletedAt: null } },
                vendedor: true,
                presupuesto: true
            }
        });
        return v ? this.mapToEntity(v) : null;
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

    async removePago(pagoId: number): Promise<void> {
        await prisma.ventaPago.delete({ where: { id: pagoId } });
    }

    // Extras
    async listExtras(ventaId: number): Promise<any[]> {
        return prisma.ventaExtra.findMany({ where: { ventaId } });
    }

    async addExtra(ventaId: number, data: any): Promise<any> {
        return prisma.ventaExtra.create({ data: { ...data, ventaId } });
    }

    async removeExtra(extraId: number): Promise<void> {
        await prisma.ventaExtra.delete({ where: { id: extraId } });
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

    async removeCanje(canjeId: number): Promise<void> {
        await prisma.ventaCanjeVehiculo.delete({ where: { id: canjeId } });
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
