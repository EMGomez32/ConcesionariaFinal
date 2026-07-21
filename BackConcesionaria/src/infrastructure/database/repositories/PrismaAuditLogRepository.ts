import { IAuditLogRepository } from '../../../domain/repositories/IAuditLogRepository';
import { AuditLog } from '../../../domain/entities/AuditLog';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

// Sólo columnas reales: `sortBy` llega de la query y pasarlo crudo a Prisma
// devolvía 500 con cualquier valor inventado (?sortBy=drop → PrismaClientValidationError).
const SORTABLE = ['createdAt', 'accion', 'entidad', 'entidadId', 'usuarioId', 'id'];

export class PrismaAuditLogRepository implements IAuditLogRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<AuditLog>> {
        const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 10000);
        const page = Math.max(Number(options.page) || 1, 1);
        const orderKey = SORTABLE.includes(String(options.sortBy)) ? String(options.sortBy) : 'createdAt';
        const orderDir = options.sortOrder === 'asc' ? 'asc' : 'desc';

        const where = coerceFilter(filter);

        const results = await prisma.auditLog.findMany({
            where,
            take: limit,
            skip: (page - 1) * limit,
            orderBy: { [orderKey]: orderDir },
            include: {
                usuario: { select: { nombre: true, email: true } }
            }
        });

        const total = await prisma.auditLog.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<AuditLog | null> {
        const a = await prisma.auditLog.findUnique({
            where: { id },
            include: { usuario: { select: { nombre: true, email: true } } }
        });
        return a ? this.mapToEntity(a) : null;
    }

    async create(data: any): Promise<AuditLog> {
        const a = await prisma.auditLog.create({ data });
        return this.mapToEntity(a);
    }

    private mapToEntity(a: any): AuditLog {
        return new AuditLog(
            a.id,
            a.concesionariaId,
            a.usuarioId,
            a.entidad,
            a.entidadId,
            a.accion,
            a.detalle,
            a.ip,
            a.userAgent,
            a.createdAt,
            a.usuario
        );
    }
}
