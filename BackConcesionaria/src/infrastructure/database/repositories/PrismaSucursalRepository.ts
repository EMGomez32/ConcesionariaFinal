import { ISucursalRepository } from '../../../domain/repositories/ISucursalRepository';
import { Sucursal } from '../../../domain/entities/Sucursal';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

// Sólo se puede ordenar por columnas reales: `sortBy` viene de la query y
// pasarlo crudo a Prisma daba 500 con cualquier valor inventado.
const SORTABLE = ['createdAt', 'updatedAt', 'nombre', 'ciudad', 'activo'];

// Relaciones que cuelgan de una sucursal. Como el borrado es lógico, no hay FK
// que frene el borrado con hijos: el hijo quedaría apuntando a un padre
// invisible. Por eso se cuentan antes de borrar. El peor caso es `usuario`: un
// operador asignado a una sucursal que ya no existe.
const RELACIONES: { modelo: string; etiqueta: string }[] = [
    { modelo: 'vehiculo', etiqueta: 'vehículos' },
    { modelo: 'venta', etiqueta: 'ventas' },
    { modelo: 'presupuesto', etiqueta: 'presupuestos' },
    { modelo: 'usuario', etiqueta: 'usuarios asignados' },
    { modelo: 'reserva', etiqueta: 'reservas' },
    { modelo: 'gastoFijo', etiqueta: 'gastos fijos' },
    { modelo: 'postventaCaso', etiqueta: 'casos de postventa' },
    { modelo: 'financiacion', etiqueta: 'financiaciones' },
];

export class PrismaSucursalRepository implements ISucursalRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Sucursal>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
        const pageNum = Math.max(Number(page) || 1, 1);
        const orderKey = SORTABLE.includes(String(sortBy)) ? String(sortBy) : 'createdAt';
        const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

        const where = coerceFilter(filter);
        // El nombre se busca por coincidencia parcial e insensible a mayúsculas:
        // con igualdad exacta, buscar "san" no encontraba "San Martín".
        if (typeof where.nombre === 'string' && where.nombre.trim()) {
            where.nombre = { contains: where.nombre.trim(), mode: 'insensitive' };
        }

        const results = await prisma.sucursal.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [orderKey]: orderDir },
            include: {
                concesionaria: { select: { id: true, nombre: true } },
            },
        });

        const total = await prisma.sucursal.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Sucursal | null> {
        const s = await prisma.sucursal.findUnique({
            where: { id },
            include: { concesionaria: { select: { id: true, nombre: true } } },
        });
        return s ? this.mapToEntity(s) : null;
    }

    /**
     * Cuenta las relaciones vivas que cuelgan de la sucursal. El count ya viene
     * filtrado por tenant y por deletedAt gracias a la extensión RLS. Devuelve
     * sólo los tipos que tienen al menos un registro.
     */
    async countRelaciones(id: number): Promise<{ etiqueta: string; cantidad: number }[]> {
        const conteos = await Promise.all(
            RELACIONES.map((r) => (prisma as any)[r.modelo].count({ where: { sucursalId: id } })),
        );
        return RELACIONES
            .map((r, i) => ({ etiqueta: r.etiqueta, cantidad: conteos[i] as number }))
            .filter((r) => r.cantidad > 0);
    }

    /**
     * Whitelist de campos editables. El body llega del cliente y la validación
     * no descarta claves desconocidas, así que sin esto se podrían pisar
     * columnas internas (deletedAt, createdAt, concesionariaId).
     */
    private pickEditable(data: any): Record<string, any> {
        const CAMPOS = ['nombre', 'direccion', 'ciudad', 'email', 'telefono', 'activo'];
        const payload: Record<string, any> = {};
        for (const campo of CAMPOS) {
            if (data[campo] !== undefined) {
                payload[campo] = data[campo] === '' ? null : data[campo];
            }
        }
        return payload;
    }

    async create(data: any): Promise<Sucursal> {
        const payload = this.pickEditable(data);
        // Para un admin, el RLS inyecta concesionariaId solo; para un super_admin
        // NO (no está atado a un tenant), así que el controller lo resuelve y acá
        // se setea explícito. `pickEditable` no lo incluye a propósito: el valor
        // lo controla el controller, no el body crudo del cliente.
        if (data.concesionariaId != null) {
            payload.concesionariaId = Number(data.concesionariaId);
        }
        const s = await prisma.sucursal.create({
            data: payload as any,
            include: { concesionaria: { select: { id: true, nombre: true } } },
        });
        return this.mapToEntity(s);
    }

    async update(id: number, data: any): Promise<Sucursal> {
        const s = await prisma.sucursal.update({
            where: { id },
            data: this.pickEditable(data),
            include: { concesionaria: { select: { id: true, nombre: true } } },
        });
        return this.mapToEntity(s);
    }

    async delete(id: number): Promise<void> {
        await prisma.sucursal.delete({ where: { id } });
    }

    private mapToEntity(s: any): Sucursal {
        return new Sucursal(
            s.id,
            s.concesionariaId,
            s.nombre,
            s.direccion ?? null,
            s.ciudad ?? null,
            s.email ?? null,
            s.telefono ?? null,
            s.activo,
            s.createdAt,
            s.updatedAt,
            s.deletedAt ?? null,
            s.concesionaria,
        );
    }
}
