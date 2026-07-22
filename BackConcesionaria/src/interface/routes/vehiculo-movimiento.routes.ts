import { Router } from 'express';
import { VehiculoMovimientoController } from '../controllers/VehiculoMovimientoController';
import { validateBody } from '../middlewares/validate.middleware';
import { createMovimientoSchema, marcarRetornoSchema } from '../validation/vehiculo-movimiento.schema';

const router = Router();

/**
 * @openapi
 * /vehiculo-movimientos:
 *   get:
 *     tags: [Vehículos]
 *     summary: Listar movimientos de vehículos
 *     description: Historial de cambios de sucursal, reservas, ventas, etc.
 *     parameters:
 *       - { $ref: '#/components/parameters/pageParam' }
 *       - { $ref: '#/components/parameters/limitParam' }
 *     responses:
 *       200:
 *         description: Listado paginado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results: { type: array, items: { type: object } }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 totalPages: { type: integer }
 *                 totalResults: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', VehiculoMovimientoController.getAll);

/**
 * @openapi
 * /vehiculo-movimientos:
 *   post:
 *     tags: [Vehículos]
 *     summary: Crear movimiento de vehículo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehiculoId, tipo]
 *             properties:
 *               vehiculoId: { type: integer }
 *               tipo: { type: string }
 *               sucursalOrigenId: { type: integer, nullable: true }
 *               sucursalDestinoId: { type: integer, nullable: true }
 *               motivo: { type: string }
 *     responses:
 *       201: { description: Movimiento creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/', validateBody(createMovimientoSchema), VehiculoMovimientoController.create);

/**
 * @openapi
 * /vehiculo-movimientos/{id}/retorno:
 *   patch:
 *     tags: [Vehículos]
 *     summary: Marcar el retorno de una preparación
 *     description: Cierra el ciclo de un envío a preparación (mecánico, lavadero, etc.) registrando su vuelta.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Retorno registrado }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/retorno', validateBody(marcarRetornoSchema), VehiculoMovimientoController.marcarRetorno);

export default router;
