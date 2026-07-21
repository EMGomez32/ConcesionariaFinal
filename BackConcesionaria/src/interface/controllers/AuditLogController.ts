import { Request, Response, NextFunction } from 'express';
import { PrismaAuditLogRepository } from '../../infrastructure/database/repositories/PrismaAuditLogRepository';
import { GetAuditLogs } from '../../application/use-cases/auditoria/GetAuditLogs';
import { GetAuditLogById } from '../../application/use-cases/auditoria/GetAuditLogById';
import { Col, sendCsv } from '../../utils/csv';

const repository = new PrismaAuditLogRepository();
const getAuditLogsUC = new GetAuditLogs(repository);
const getByIdUC = new GetAuditLogById(repository);

function buildFilters(rawQuery: any) {
    const { limit, page, sortBy, sortOrder, startDate, endDate, ...filters } = rawQuery;

    if (startDate || endDate) {
        const range: any = {};
        if (startDate) range.gte = new Date(startDate as string);
        if (endDate) range.lte = new Date(endDate as string);
        filters.createdAt = range;
    }

    return { filters, options: { limit, page, sortBy, sortOrder } };
}

export class AuditLogController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { filters, options } = buildFilters(req.query);
            const result = await getAuditLogsUC.execute(filters, options as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async exportCsv(req: Request, res: Response, next: NextFunction) {
        try {
            const { filters } = buildFilters(req.query);
            const result = await getAuditLogsUC.execute(filters, { limit: 10000 } as any);

            const cols: Col[] = [
                { key: 'id', header: 'id' },
                { key: 'fecha', header: 'fecha' },
                { key: 'usuarioId', header: 'usuarioId' },
                { key: 'usuarioNombre', header: 'usuarioNombre' },
                { key: 'usuarioEmail', header: 'usuarioEmail' },
                { key: 'entidad', header: 'entidad' },
                { key: 'entidadId', header: 'entidadId' },
                { key: 'accion', header: 'accion' },
                { key: 'detalle', header: 'detalle' },
                { key: 'ip', header: 'ip' },
                { key: 'userAgent', header: 'userAgent' },
            ];

            const rows = (result.results as any[]).map(r => ({
                id: r.id,
                fecha: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
                usuarioId: r.usuarioId,
                usuarioNombre: r.usuario?.nombre,
                usuarioEmail: r.usuario?.email,
                entidad: r.entidad,
                entidadId: r.entidadId,
                accion: r.accion,
                detalle: r.detalle,
                ip: r.ip,
                userAgent: r.userAgent,
            }));

            // sendCsv escapa cada celda (comillas/comas/saltos) y neutraliza la
            // inyección de fórmulas de Excel: userAgent/detalle son texto que
            // entra sin sanitizar desde el request.
            sendCsv(res, 'audit-log', cols, rows);
        } catch (error) {
            next(error);
        }
    }
}
