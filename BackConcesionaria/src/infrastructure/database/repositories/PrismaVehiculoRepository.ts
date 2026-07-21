import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { Vehiculo } from '../../../domain/entities/Vehiculo';
import prisma from '../prisma';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

export class PrismaVehiculoRepository implements IVehiculoRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Vehiculo>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);

        // A diferencia del resto de los repos, acá `filter` NO son query params
        // crudos: VehiculoController.getAll ya arma el where de Prisma (OR con
        // contains para la búsqueda y Number() para sucursalId). Por eso no
        // necesita coerceFilter.
        const results = await prisma.vehiculo.findMany({
            where: filter,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [sortBy as string]: sortOrder },
            include: {
                sucursal: true,
                archivos: { where: { deletedAt: null } },
            }
        });

        const total = await prisma.vehiculo.count({ where: filter });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Vehiculo | null> {
        const v = await prisma.vehiculo.findUnique({
            where: { id },
            include: {
                sucursal: true,
                archivos: { where: { deletedAt: null } },
                movimientos: {
                    where: { deletedAt: null },
                    include: {
                        desdeSucursal: true,
                        hastaSucursal: true,
                    }
                }
            }
        });
        return v ? this.mapToEntity(v) : null;
    }

    async create(data: any): Promise<Vehiculo> {
        const v = await prisma.vehiculo.create({ data });
        return this.mapToEntity(v);
    }

    async update(id: number, data: any): Promise<Vehiculo> {
        const v = await prisma.vehiculo.update({
            where: { id },
            data,
        });
        return this.mapToEntity(v);
    }

    async delete(id: number): Promise<void> {
        await prisma.vehiculo.delete({ where: { id } });
    }

    async countVentas(id: number): Promise<number> {
        return prisma.venta.count({ where: { vehiculoId: id } });
    }

    async countReservasActivas(id: number): Promise<number> {
        return prisma.reserva.count({ where: { vehiculoId: id, estado: 'activa' } });
    }

    private mapToEntity(v: any): Vehiculo {
        return new Vehiculo(
            v.id,
            v.concesionariaId,
            v.sucursalId,
            v.marca,
            v.modelo,
            v.version,
            v.anio,
            v.dominio,
            v.vin,
            v.kmIngreso,
            v.color,
            v.estado,
            v.fechaIngreso,
            v.precioLista ? Number(v.precioLista) : null,
            v.createdAt,
            v.updatedAt,
            v.deletedAt,
            v.sucursal,
            v.archivos,
            v.moneda ?? 'ARS'
        );
    }
}
