import { IIngresoVehiculoRepository } from '../../../domain/repositories/IIngresoVehiculoRepository';
import { IngresoVehiculo } from '../../../domain/entities/IngresoVehiculo';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions, PaginatedResponse } from '../../../types/common';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class PrismaIngresoVehiculoRepository implements IIngresoVehiculoRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<IngresoVehiculo>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);

        const where = coerceFilter(filter);

        const results = await prisma.ingresoVehiculo.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [sortBy as string]: sortOrder },
            include: {
                vehiculo: true,
                sucursal: true,
                clienteOrigen: true,
                proveedorOrigen: true,
                registradoPor: { select: { nombre: true, email: true } }
            }
        });

        const total = await prisma.ingresoVehiculo.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<IngresoVehiculo | null> {
        const i = await prisma.ingresoVehiculo.findUnique({
            where: { id },
            include: {
                vehiculo: true,
                sucursal: true,
                clienteOrigen: true,
                proveedorOrigen: true,
                registradoPor: { select: { nombre: true, email: true } }
            }
        });
        return i ? this.mapToEntity(i) : null;
    }

    async create(data: any): Promise<IngresoVehiculo> {
        const { vehiculoId, sucursalId, registradoPorId, fechaIngreso, tipoIngreso, valorTomado, ...rest } = data;

        const v = await prisma.vehiculo.findUnique({ where: { id: vehiculoId } });
        if (!v) throw new NotFoundException('Vehículo');

        return prisma.$transaction(async (tx) => {
            const i = await tx.ingresoVehiculo.create({
                data: {
                    ...rest,
                    vehiculoId,
                    sucursalId,
                    registradoPorId,
                    fechaIngreso: new Date(fechaIngreso),
                    tipoIngreso,
                    valorTomado: valorTomado ? Number(valorTomado) : null,
                    concesionariaId: v.concesionariaId
                }
            });

            await tx.vehiculo.update({
                where: { id: vehiculoId },
                data: { sucursalId }
            });

            await tx.vehiculoMovimiento.create({
                data: {
                    vehiculoId,
                    concesionariaId: v.concesionariaId,
                    tipo: 'ingreso',
                    fecha: new Date(),
                    hastaSucursalId: sucursalId,
                    registradoPorId,
                    motivo: `Ingreso registrado: ${tipoIngreso}`
                }
            });

            return this.mapToEntity(i);
        });
    }

    async delete(id: number): Promise<void> {
        await prisma.ingresoVehiculo.delete({ where: { id } });
    }

    private mapToEntity(i: any): IngresoVehiculo {
        return new IngresoVehiculo(
            i.id,
            i.concesionariaId,
            i.vehiculoId,
            i.registradoPorId,
            i.sucursalId,
            i.clienteOrigenId,
            i.proveedorOrigenId,
            i.fechaIngreso,
            i.tipoIngreso,
            i.valorTomado ? Number(i.valorTomado) : null,
            i.nroIngreso,
            i.observaciones,
            i.createdAt,
            i.updatedAt,
            i.deletedAt,
            i.vehiculo,
            i.sucursal,
            i.registradoPor,
            i.clienteOrigen,
            i.proveedorOrigen
        );
    }
}
