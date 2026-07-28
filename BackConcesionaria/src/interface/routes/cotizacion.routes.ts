import { Router } from 'express';
import { CotizacionController } from '../controllers/CotizacionController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { upsertCotizacionSchema } from '../validation/cotizacion.schema';

const router = Router();

/**
 * @openapi
 * /cotizaciones:
 *   get:
 *     tags: [Cotizaciones]
 *     summary: Listar cotizaciones del dólar (historial por día)
 *     parameters:
 *       - { name: desde, in: query, schema: { type: string, format: date } }
 *       - { name: hasta, in: query, schema: { type: string, format: date } }
 *       - { $ref: '#/components/parameters/pageParam' }
 *       - { $ref: '#/components/parameters/limitParam' }
 *     responses:
 *       200: { description: Listado paginado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', CotizacionController.getAll);

/**
 * @openapi
 * /cotizaciones/vigente:
 *   get:
 *     tags: [Cotizaciones]
 *     summary: Cotización vigente a una fecha (o la última cargada)
 *     parameters:
 *       - { name: fecha, in: query, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Cotización aplicable, o null si no hay ninguna cargada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/vigente', CotizacionController.getVigente);

/**
 * @openapi
 * /cotizaciones:
 *   post:
 *     tags: [Cotizaciones]
 *     summary: Cargar la cotización de un día (upsert por fecha)
 *     description: Solo admin. Si ya existe una cotización para esa fecha, la pisa.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fecha, valor]
 *             properties:
 *               fecha: { type: string, format: date }
 *               valor: { type: number, description: Pesos por 1 USD }
 *     responses:
 *       201: { description: Cotización cargada }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', authorize('admin'), validateBody(upsertCotizacionSchema), CotizacionController.upsert);

/**
 * @openapi
 * /cotizaciones/{id}:
 *   delete:
 *     tags: [Cotizaciones]
 *     summary: Eliminar una cotización
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin'), CotizacionController.remove);

export default router;
