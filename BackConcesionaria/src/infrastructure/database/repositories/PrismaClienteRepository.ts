import { IClienteRepository } from '../../../domain/repositories/IClienteRepository';
import { Cliente } from '../../../domain/entities/Cliente';
import prisma from '../prisma';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

export class PrismaClienteRepository implements IClienteRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Cliente>> {
        const limit = Number(options.limit) || 20;
        const page = Number(options.page) || 1;
        const sortBy = options.sortBy || 'createdAt';
        const sortOrder = options.sortOrder || 'desc';

        // Build where clause with contains for text fields
        const whereClause: any = {};

        // Búsqueda libre: un solo término contra los campos con los que se
        // identifica a un cliente en el mostrador (nombre, documento, contacto).
        if (filter.search) {
            const q = String(filter.search);
            whereClause.OR = [
                { nombre: { contains: q, mode: 'insensitive' } },
                { dni: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { telefono: { contains: q, mode: 'insensitive' } },
            ];
        }
        if (filter.nombre) {
            whereClause.nombre = { contains: filter.nombre, mode: 'insensitive' };
        }
        if (filter.email) {
            whereClause.email = { contains: filter.email, mode: 'insensitive' };
        }
        if (filter.telefono) {
            whereClause.telefono = { contains: filter.telefono };
        }
        if (filter.dni) {
            whereClause.dni = { contains: filter.dni };
        }
        if (filter.concesionariaId !== undefined) {
            whereClause.concesionariaId = filter.concesionariaId;
        }

        const results = await prisma.cliente.findMany({
            where: whereClause,
            take: limit,
            skip: (page - 1) * limit,
            orderBy: { [sortBy as string]: sortOrder },
            include: {
                concesionaria: {
                    select: {
                        id: true,
                        nombre: true
                    }
                }
            }
        });

        const total = await prisma.cliente.count({ where: whereClause });

        return {
            results: results.map(this.mapToEntity),
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Cliente | null> {
        const c = await prisma.cliente.findUnique({ 
            where: { id },
            include: {
                concesionaria: {
                    select: {
                        id: true,
                        nombre: true
                    }
                }
            }
        });
        return c ? this.mapToEntity(c) : null;
    }

    /**
     * Whitelist de campos editables. El body llega del cliente y la validación
     * de express-validator no descarta claves desconocidas, así que sin esto se
     * podrían pisar columnas internas (deletedAt, createdAt, concesionariaId).
     */
    private pickEditable(data: any): Record<string, any> {
        const CAMPOS = ['nombre', 'dni', 'telefono', 'email', 'direccion', 'observaciones'];
        const payload: Record<string, any> = {};
        for (const campo of CAMPOS) {
            if (data[campo] !== undefined) {
                payload[campo] = data[campo] === '' ? null : data[campo];
            }
        }
        return payload;
    }

    async create(data: any): Promise<Cliente> {
        // concesionariaId lo inyecta la extensión RLS de Prisma.
        const c = await prisma.cliente.create({ data: this.pickEditable(data) as any });
        return this.mapToEntity(c);
    }

    async update(id: number, data: any): Promise<Cliente> {
        const c = await prisma.cliente.update({
            where: { id },
            data: this.pickEditable(data),
        });
        return this.mapToEntity(c);
    }

    async delete(id: number): Promise<void> {
        await prisma.cliente.delete({ where: { id } });
    }

    async countVentas(id: number): Promise<number> {
        return prisma.venta.count({ where: { clienteId: id } });
    }

    async countPresupuestos(id: number): Promise<number> {
        return prisma.presupuesto.count({ where: { clienteId: id } });
    }

    private mapToEntity(c: any): Cliente {
        return new Cliente(
            c.id,
            c.concesionariaId,
            c.nombre,
            c.dni,
            c.telefono,
            c.email,
            c.direccion,
            c.observaciones,
            c.createdAt,
            c.updatedAt,
            c.deletedAt,
            c.concesionaria ? { id: c.concesionaria.id, nombre: c.concesionaria.nombre } : undefined
        );
    }
}
