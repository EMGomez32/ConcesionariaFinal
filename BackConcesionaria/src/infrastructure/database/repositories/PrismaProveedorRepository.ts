import { IProveedorRepository } from '../../../domain/repositories/IProveedorRepository';
import { Proveedor } from '../../../domain/entities/Proveedor';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

export class PrismaProveedorRepository implements IProveedorRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Proveedor>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);

        // coerceFilter convierte los query params (?activo=true llega como
        // string) a los tipos que espera Prisma.
        const { nombre, search, ...resto } = filter;
        const where: any = coerceFilter(resto);

        // Los campos de texto se buscan por coincidencia parcial: filtrar por
        // igualdad exacta obligaba a tipear el nombre completo del proveedor.
        const termino = search || nombre;
        if (termino) {
            const q = String(termino);
            where.OR = [
                { nombre: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { telefono: { contains: q, mode: 'insensitive' } },
            ];
        }

        // Multi-tenancy and Soft-delete are handled automatically by our Prisma extension!
        const results = await prisma.proveedor.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [sortBy as string]: sortOrder },
        });

        const total = await prisma.proveedor.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Proveedor | null> {
        // El detalle del proveedor tiene pestañas de vehículos comprados, gastos
        // e ítems de postventa, y los lee de esta misma respuesta: sin los
        // include las tres pestañas quedaban siempre vacías.
        const p = await prisma.proveedor.findUnique({
            where: { id },
            include: {
                vehiculosCompra: { where: { deletedAt: null } },
                gastosVehiculo: { where: { deletedAt: null }, include: { vehiculo: true } },
                postventaItems: { where: { deletedAt: null }, include: { caso: true } },
                // Unidades que se enviaron a este proveedor para preparación.
                movimientosDestino: {
                    where: { deletedAt: null },
                    include: { vehiculo: true },
                    orderBy: { fecha: 'desc' },
                },
            },
        });
        if (!p) return null;

        return {
            ...this.mapToEntity(p),
            vehiculosCompra: p.vehiculosCompra,
            gastosVehiculo: p.gastosVehiculo,
            postventaItems: p.postventaItems,
            movimientosDestino: p.movimientosDestino,
        } as unknown as Proveedor;
    }

    /**
     * Whitelist de campos editables. El body llega del cliente y la validación
     * no descarta claves desconocidas, así que sin esto se podrían pisar
     * columnas internas (deletedAt, createdAt, concesionariaId).
     */
    private pickEditable(data: any): Record<string, any> {
        const CAMPOS = ['nombre', 'tipo', 'telefono', 'email', 'direccion', 'activo'];
        const payload: Record<string, any> = {};
        for (const campo of CAMPOS) {
            if (data[campo] !== undefined) {
                payload[campo] = data[campo] === '' ? null : data[campo];
            }
        }
        return payload;
    }

    async create(data: any): Promise<Proveedor> {
        // concesionariaId lo inyecta la extensión RLS de Prisma.
        const p = await prisma.proveedor.create({ data: this.pickEditable(data) as any });
        return this.mapToEntity(p);
    }

    async update(id: number, data: any): Promise<Proveedor> {
        const p = await prisma.proveedor.update({
            where: { id },
            data: this.pickEditable(data),
        });
        return this.mapToEntity(p);
    }

    async delete(id: number): Promise<void> {
        await prisma.proveedor.delete({ where: { id } });
    }

    async countGastos(id: number): Promise<number> {
        return prisma.gastoVehiculo.count({ where: { proveedorId: id } });
    }

    async countPostventaItems(id: number): Promise<number> {
        return prisma.postventaItem.count({ where: { proveedorId: id } });
    }

    private mapToEntity(p: any): Proveedor {
        return new Proveedor(
            p.id,
            p.concesionariaId,
            p.nombre,
            p.tipo,
            p.telefono,
            p.email,
            p.direccion,
            p.activo,
            p.createdAt,
            p.updatedAt,
            p.deletedAt
        );
    }
}
