import { IReservaRepository } from '../../../domain/repositories/IReservaRepository';
import { Reserva } from '../../../domain/entities/Reserva';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

export class PrismaReservaRepository implements IReservaRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Reserva>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);

        const where = coerceFilter(filter);


        const results = await prisma.reserva.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [sortBy as string]: sortOrder },
            include: {
                cliente: true,
                vehiculo: true,
                creadaPor: { select: { nombre: true, email: true } },
                sucursal: true
            }
        });

        const total = await prisma.reserva.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Reserva | null> {
        const r = await prisma.reserva.findUnique({
            where: { id },
            include: { cliente: true, vehiculo: true, sucursal: true, creadaPor: true }
        });
        return r ? this.mapToEntity(r) : null;
    }

    async create(data: any): Promise<Reserva> {
        const r = await prisma.reserva.create({ data });
        return this.mapToEntity(r);
    }

    async update(id: number, data: any): Promise<Reserva> {
        const r = await prisma.reserva.update({
            where: { id },
            data,
        });
        return this.mapToEntity(r);
    }

    async delete(id: number): Promise<void> {
        await prisma.reserva.delete({ where: { id } });
    }

    // Devuelve la reserva con los nombres de campo que espera el frontend
    // (monto/moneda/fechaVencimiento/vendedorId), leyendo de las columnas reales
    // de la DB (montoSenia/venceEl/creadaPorId).
    private mapToEntity(r: any): Reserva {
        return {
            id: r.id,
            concesionariaId: r.concesionariaId,
            sucursalId: r.sucursalId,
            vehiculoId: r.vehiculoId,
            clienteId: r.clienteId,
            vendedorId: r.creadaPorId ?? null,
            estado: r.estado,
            fecha: r.fecha,
            fechaVencimiento: r.venceEl ?? null,
            monto: r.montoSenia != null ? Number(r.montoSenia) : null,
            moneda: r.moneda ?? 'ARS',
            observaciones: r.observaciones ?? null,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            deletedAt: r.deletedAt,
            cliente: r.cliente,
            vehiculo: r.vehiculo,
            sucursal: r.sucursal,
            creadaPor: r.creadaPor,
        } as unknown as Reserva;
    }
}
