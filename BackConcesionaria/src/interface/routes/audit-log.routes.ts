import { Router } from 'express';
import { AuditLogController } from '../controllers/AuditLogController';

const router = Router();

/**
 * @openapi
 * /auditoria:
 *   get:
 *     tags: [Auditoría]
 *     summary: Listar entradas del log de auditoría
 *     description: Acepta filtros startDate y endDate (ISO 8601) sobre createdAt, además de filtros por entidad/accion/usuarioId.
 *     parameters:
 *       - { $ref: '#/components/parameters/pageParam' }
 *       - { $ref: '#/components/parameters/limitParam' }
 *       - { name: startDate, in: query, schema: { type: string, format: date-time } }
 *       - { name: endDate, in: query, schema: { type: string, format: date-time } }
 *       - { name: entidad, in: query, schema: { type: string } }
 *       - { name: accion, in: query, schema: { type: string } }
 *       - { name: usuarioId, in: query, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Listado paginado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results: { type: array, items: { $ref: '#/components/schemas/AuditLog' } }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 totalPages: { type: integer }
 *                 totalResults: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', AuditLogController.getAll);

// /export must be defined BEFORE /:id so Express doesn't capture "export" as the id param.
/**
 * @openapi
 * /auditoria/export:
 *   get:
 *     tags: [Auditoría]
 *     summary: Exportar log de auditoría a CSV
 *     description: Devuelve un CSV (UTF-8 con BOM para que Excel detecte la codificación). Acepta los mismos filtros que GET /auditoria.
 *     parameters:
 *       - { name: startDate, in: query, schema: { type: string, format: date-time } }
 *       - { name: endDate, in: query, schema: { type: string, format: date-time } }
 *       - { name: entidad, in: query, schema: { type: string } }
 *       - { name: accion, in: query, schema: { type: string } }
 *       - { name: usuarioId, in: query, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Archivo CSV
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/export', AuditLogController.exportCsv);

/**
 * @openapi
 * /auditoria/{id}:
 *   get:
 *     tags: [Auditoría]
 *     summary: Obtener entrada de auditoría por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Entrada encontrada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuditLog' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', AuditLogController.getById);

export default router;
