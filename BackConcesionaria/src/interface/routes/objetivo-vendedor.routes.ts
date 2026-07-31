import { Router } from 'express';
import { ObjetivoVendedorController } from '../controllers/ObjetivoVendedorController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { upsertObjetivoVendedorSchema } from '../validation/objetivo-vendedor.schema';

const router = Router();

// Objetivos por vendedor: performance individual del equipo comercial. Expone las
// ventas/facturación de cada vendedor, así que —igual que ranking y comisiones—
// es sólo admin (super_admin pasa por el bypass de authorize).

/**
 * @openapi
 * /objetivos-vendedor:
 *   get:
 *     tags: [Objetivos]
 *     summary: Objetivos por vendedor de un mes, con progreso
 *     description: Por cada vendedor con objetivo fijado, sus metas de unidades y/o facturado y el avance real de sus ventas del mes. Solo admin.
 *     parameters:
 *       - { name: anio, in: query, schema: { type: integer } }
 *       - { name: mes, in: query, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     responses:
 *       200: { description: Objetivos del período con progreso }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', authorize('admin'), ObjetivoVendedorController.getAll);

/**
 * @openapi
 * /objetivos-vendedor:
 *   post:
 *     tags: [Objetivos]
 *     summary: Fijar el objetivo mensual de un vendedor (upsert por período)
 *     description: Solo admin. Al menos uno de unidadesObjetivo / montoObjetivo.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vendedorId, anio, mes]
 *             properties:
 *               vendedorId: { type: integer }
 *               anio: { type: integer }
 *               mes: { type: integer, minimum: 1, maximum: 12 }
 *               unidadesObjetivo: { type: integer, nullable: true }
 *               montoObjetivo: { type: number, nullable: true }
 *               moneda: { type: string, enum: [ARS, USD] }
 *     responses:
 *       201: { description: Objetivo fijado }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/', authorize('admin'), validateBody(upsertObjetivoVendedorSchema), ObjetivoVendedorController.upsert);

/**
 * @openapi
 * /objetivos-vendedor/{id}:
 *   delete:
 *     tags: [Objetivos]
 *     summary: Eliminar un objetivo
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.delete('/:id', authorize('admin'), ObjetivoVendedorController.remove);

export default router;
