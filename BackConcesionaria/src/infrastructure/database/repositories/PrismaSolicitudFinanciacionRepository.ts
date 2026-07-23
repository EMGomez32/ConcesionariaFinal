import { ISolicitudFinanciacionRepository } from '../../../domain/repositories/ISolicitudFinanciacionRepository';
import { SolicitudFinanciacion } from '../../../domain/entities/SolicitudFinanciacion';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

// Lo que el cliente puede escribir al crear. `estado` queda afuera a propósito:
// el default del schema es 'borrador' y la máquina de estados asume ese punto de
// partida, así que aceptarlo del body permitiría crear una solicitud ya
// 'aprobada' salteándose las transiciones. `concesionariaId` lo inyecta la
// extensión RLS desde el token.
const CREATABLE = [
    'sucursalId', 'ventaId', 'presupuestoId', 'vehiculoId', 'clienteId', 'financieraId',
    'montoSolicitado', 'plazoCuotas', 'tasaEstimada', 'observaciones',
] as const;

// Al actualizar se agregan los campos de la respuesta de la financiera. El
// cliente y la financiera no se reasignan: eso sería otra solicitud. El
// vehículo sí, pero sólo en borrador: lo gatea UpdateSolicitud.
const UPDATABLE = [
    'estado', 'sucursalId', 'ventaId', 'presupuestoId', 'vehiculoId',
    'montoSolicitado', 'plazoCuotas', 'tasaEstimada',
    'fechaEnvio', 'fechaRespuesta', 'montoAprobado', 'tasaFinal', 'observaciones',
] as const;

const DATE_FIELDS = ['fechaEnvio', 'fechaRespuesta'];

function pick(data: any = {}, allowed: readonly string[]): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of allowed) {
        if (data[key] === undefined) continue;
        // El <input type="date"> manda 'YYYY-MM-DD'; Prisma espera DateTime.
        out[key] = DATE_FIELDS.includes(key) && data[key] !== null
            ? new Date(data[key])
            : data[key];
    }
    return out;
}

/** Prisma devuelve Decimal como string: sin esto, el front recibe texto. */
const num = (v: any): number | null =>
    v === null || v === undefined ? null : Number(v);

const INCLUDES = {
    cliente: true,
    financiera: true,
    sucursal: true,
    venta: true,
    // Con `select` y no `true`: Vehiculo es un modelo ancho (incluye precioCompra,
    // que no tiene por qué viajar acá) y el listado ya trae cliente, financiera,
    // sucursal y venta enteros. Esto es exactamente lo que la UI muestra.
    vehiculo: {
        select: {
            id: true, marca: true, modelo: true, version: true,
            anio: true, dominio: true, estado: true,
        },
    },
};

export class PrismaSolicitudFinanciacionRepository implements ISolicitudFinanciacionRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<SolicitudFinanciacion>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);

        const where = coerceFilter(filter);

        const results = await prisma.solicitudFinanciacion.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [sortBy as string]: sortOrder },
            include: INCLUDES,
        });

        const total = await prisma.solicitudFinanciacion.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<SolicitudFinanciacion | null> {
        const s = await prisma.solicitudFinanciacion.findUnique({
            where: { id },
            include: {
                ...INCLUDES,
                presupuesto: true,
                archivos: { orderBy: { createdAt: 'desc' } },
            },
        });
        return s ? this.mapToEntity(s) : null;
    }

    async create(data: any): Promise<SolicitudFinanciacion> {
        const payload = pick(data, CREATABLE);
        // super_admin no recibe la inyección de concesionariaId del RLS: el
        // controller lo resuelve y acá se setea explícito, fuera del pick.
        if (data.concesionariaId != null) {
            payload.concesionariaId = Number(data.concesionariaId);
        }
        const s = await prisma.solicitudFinanciacion.create({
            data: payload as any,
            include: INCLUDES,
        });
        return this.mapToEntity(s);
    }

    async update(id: number, data: any): Promise<SolicitudFinanciacion> {
        const s = await prisma.solicitudFinanciacion.update({
            where: { id },
            data: pick(data, UPDATABLE),
            include: INCLUDES,
        });
        return this.mapToEntity(s);
    }

    async delete(id: number): Promise<void> {
        await prisma.solicitudFinanciacion.delete({ where: { id } });
    }

    private mapToEntity(s: any): SolicitudFinanciacion {
        return new SolicitudFinanciacion(
            s.id,
            s.concesionariaId,
            s.sucursalId ?? null,
            s.ventaId ?? null,
            s.presupuestoId ?? null,
            s.vehiculoId ?? null,
            s.clienteId,
            s.financieraId,
            s.estado,
            num(s.montoSolicitado),
            s.plazoCuotas ?? null,
            num(s.tasaEstimada),
            s.fechaEnvio ?? null,
            s.fechaRespuesta ?? null,
            num(s.montoAprobado),
            num(s.tasaFinal),
            s.observaciones ?? null,
            s.createdAt,
            s.updatedAt,
            s.deletedAt ?? null,
            s.cliente,
            s.financiera,
            s.sucursal,
            s.venta,
            s.presupuesto,
            s.archivos,
            s.vehiculo
        );
    }
}
