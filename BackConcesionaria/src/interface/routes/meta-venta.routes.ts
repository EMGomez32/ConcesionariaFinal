import { Router } from 'express';
import { MetaVentaController } from '../controllers/MetaVentaController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { upsertMetaVentaSchema } from '../validation/meta-venta.schema';

const router = Router();

/**
 * @openapi
 * /metas/actual:
 *   get:
 *     tags: [Metas]
 *     summary: Meta de ventas de un mes (por defecto, el actual)
 *     parameters:
 *       - { name: anio, in: query, schema: { type: integer } }
 *       - { name: mes, in: query, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     responses:
 *       200: { description: Meta del período, o null si no se fijó }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/actual', MetaVentaController.getActual);

/**
 * @openapi
 * /metas:
 *   post:
 *     tags: [Metas]
 *     summary: Fijar la meta de ventas de un mes (upsert por período)
 *     description: Solo admin. Al menos uno de unidadesObjetivo / montoObjetivo.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [anio, mes]
 *             properties:
 *               anio: { type: integer }
 *               mes: { type: integer, minimum: 1, maximum: 12 }
 *               unidadesObjetivo: { type: integer, nullable: true }
 *               montoObjetivo: { type: number, nullable: true }
 *               moneda: { type: string, enum: [ARS, USD] }
 *     responses:
 *       201: { description: Meta fijada }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', authorize('admin'), validateBody(upsertMetaVentaSchema), MetaVentaController.upsert);

/**
 * @openapi
 * /metas/{id}:
 *   delete:
 *     tags: [Metas]
 *     summary: Eliminar una meta
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.delete('/:id', authorize('admin'), MetaVentaController.remove);

export default router;
