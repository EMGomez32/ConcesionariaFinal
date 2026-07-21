import { Router } from 'express';
import { ReservaController } from '../controllers/ReservaController';

const router = Router();

/**
 * @openapi
 * /reservas:
 *   get:
 *     tags: [Reservas]
 *     summary: Listar reservas
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
router.get('/', ReservaController.getAll);

/**
 * @openapi
 * /reservas/{id}:
 *   get:
 *     tags: [Reservas]
 *     summary: Obtener reserva por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Reserva encontrada, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', ReservaController.getById);

/**
 * @openapi
 * /reservas:
 *   post:
 *     tags: [Reservas]
 *     summary: Crear reserva con seña
 *     description: Marca el vehículo como reservado y registra el movimiento.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehiculoId, clienteId, monto]
 *             properties:
 *               vehiculoId: { type: integer }
 *               clienteId: { type: integer }
 *               monto: { type: number }
 *               fecha: { type: string, format: date-time }
 *               vencimiento: { type: string, format: date-time }
 *               observaciones: { type: string }
 *     responses:
 *       201: { description: Reserva creada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.post('/', ReservaController.create);

/**
 * @openapi
 * /reservas/{id}:
 *   patch:
 *     tags: [Reservas]
 *     summary: Actualizar reserva
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               monto: { type: number }
 *               vencimiento: { type: string, format: date-time }
 *               observaciones: { type: string }
 *     responses:
 *       200: { description: Reserva actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', ReservaController.update);

/**
 * @openapi
 * /reservas/{id}:
 *   delete:
 *     tags: [Reservas]
 *     summary: Cancelar reserva
 *     description: Libera el vehículo y genera un movimiento `liberacion_reserva`.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Reserva cancelada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.delete('/:id', ReservaController.delete);

export default router;
