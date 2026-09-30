import { Router, Request, Response, NextFunction } from 'express';
import { rawPrisma } from '../../infrastructure/database/prisma';
import { authorize } from '../middlewares/authorize.middleware';

const router = Router();

/**
 * @openapi
 * /security-events:
 *   get:
 *     tags: [Auditoría]
 *     summary: Rastro de seguridad de plataforma (sólo super_admin)
 *     description: |
 *       Eventos SIN tenant que audit_log no puede guardar: acciones de super_admin,
 *       intentos de login contra emails inexistentes, bloqueos por límite de intentos y
 *       alertas de fuerza bruta. El email de los intentos se guarda hasheado.
 *     parameters:
 *       - { name: accion, in: query, schema: { type: string } }
 *       - { name: desde, in: query, schema: { type: string, format: date-time } }
 *       - { name: limit, in: query, schema: { type: integer, maximum: 500, default: 100 } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *     responses:
 *       200: { description: Listado paginado, más reciente primero }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
// authorize('super_admin') POR RUTA (no en el montaje): un guard de montaje exime al archivo entero del
// centinela de permisos y hay que declararlo aparte. authorize('super_admin') sólo deja pasar a super_admin.
router.get('/', authorize('super_admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit)) || 100, 1), 500);
        const page = Math.min(Math.max(Math.trunc(Number(req.query.page)) || 1, 1), 100_000);
        const where: Record<string, unknown> = {};
        if (typeof req.query.accion === 'string' && req.query.accion) where.accion = req.query.accion;
        const desde = typeof req.query.desde === 'string' ? new Date(req.query.desde) : null;
        if (desde && !Number.isNaN(desde.getTime())) where.createdAt = { gte: desde };

        const [results, total] = await Promise.all([
            rawPrisma.securityEvent.findMany({
                where,
                orderBy: { id: 'desc' },
                take: limit,
                skip: (page - 1) * limit,
            }),
            rawPrisma.securityEvent.count({ where }),
        ]);
        res.json({ results, page, limit, totalPages: Math.ceil(total / limit), totalResults: total });
    } catch (error) {
        next(error);
    }
});

export default router;
