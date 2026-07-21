import { IConcesionariaRepository } from '../../../domain/repositories/IConcesionariaRepository';
import { Concesionaria } from '../../../domain/entities/Concesionaria';
import prisma from '../prisma';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

export class PrismaConcesionariaRepository implements IConcesionariaRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Concesionaria>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);

        const where: any = {};

        if (filter.search) {
            where.OR = [
                { nombre: { contains: filter.search, mode: 'insensitive' } },
                { cuit: { contains: filter.search, mode: 'insensitive' } }
            ];
        } else {
            if (filter.nombre) {
                where.nombre = { contains: filter.nombre, mode: 'insensitive' };
            }
            if (filter.cuit) {
                where.cuit = { contains: filter.cuit, mode: 'insensitive' };
            }
        }

        const results = await prisma.concesionaria.findMany({
            where: { ...where },
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [sortBy as string]: sortOrder },
        });

        const total = await prisma.concesionaria.count({ where: where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Concesionaria | null> {
        const c = await prisma.concesionaria.findUnique({
            where: { id },
            include: { subscription: { include: { plan: true } } }
        });
        return c ? this.mapToEntity(c) : null;
    }

    async create(data: any): Promise<Concesionaria> {
        const c = await prisma.concesionaria.create({ data });
        return this.mapToEntity(c);
    }

    async update(id: number, data: any): Promise<Concesionaria> {
        const c = await prisma.concesionaria.update({
            where: { id },
            data,
        });
        return this.mapToEntity(c);
    }

    async delete(id: number): Promise<void> {
        await prisma.concesionaria.delete({ where: { id } });
    }

    async countActiveSucursales(id: number): Promise<number> {
        return prisma.sucursal.count({ where: { concesionariaId: id, deletedAt: null } });
    }

    async countActiveUsuarios(id: number): Promise<number> {
        return prisma.usuario.count({ where: { concesionariaId: id, deletedAt: null } });
    }

    async countActiveVehiculos(id: number): Promise<number> {
        return prisma.vehiculo.count({ where: { concesionariaId: id, deletedAt: null } });
    }

    private mapToEntity(c: any): Concesionaria {
        return new Concesionaria(
            c.id,
            c.nombre,
            c.cuit,
            c.email,
            c.telefono,
            c.direccion,
            c.createdAt,
            c.updatedAt,
            c.deletedAt,
            c.subscription
        );
    }
}
