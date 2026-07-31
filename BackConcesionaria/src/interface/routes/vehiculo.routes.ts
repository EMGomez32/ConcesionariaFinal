import { Router } from 'express';
import { VehiculoController } from '../controllers/VehiculoController';
import { ComprobanteController } from '../controllers/ComprobanteController';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';

import { validateBody } from '../middlewares/validate.middleware';
import { createVehiculoSchema, updateVehiculoSchema } from '../validation/vehiculo.schema';
const router = Router();

/**
 * @openapi
 * /vehiculos:
 *   get:
 *     tags: [Vehículos]
 *     summary: Listar vehículos del inventario
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
router.get('/', authenticate, VehiculoController.getAll);

/**
 * @openapi
 * /vehiculos/{id}:
 *   get:
 *     tags: [Vehículos]
 *     summary: Obtener vehículo por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Vehículo encontrado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', authenticate, VehiculoController.getById);

/**
 * @openapi
 * /vehiculos/{id}/ficha:
 *   get:
 *     tags: [Vehículos]
 *     summary: Ficha del vehículo en PDF (de cara al cliente)
 *     description: Una página con la marca de la concesionaria, foto principal, ficha técnica y precio de lista. No incluye datos internos (compra/gastos).
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: PDF de la ficha, content: { application/pdf: {} } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/ficha', authenticate, ComprobanteController.vehiculoFichaPdf);

/**
 * @openapi
 * /vehiculos:
 *   post:
 *     tags: [Vehículos]
 *     summary: Crear vehículo
 *     description: Requiere rol admin o vendedor.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marca, modelo]
 *             properties:
 *               marca: { type: string }
 *               modelo: { type: string }
 *               anio: { type: integer }
 *               patente: { type: string }
 *               vin: { type: string }
 *               color: { type: string }
 *               kilometraje: { type: integer }
 *               precio: { type: number }
 *               estado: { type: string }
 *               sucursalId: { type: integer }
 *     responses:
 *       201: { description: Vehículo creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/', authenticate, authorize('admin', 'vendedor'), validateBody(createVehiculoSchema), VehiculoController.create);

/**
 * @openapi
 * /vehiculos/{id}:
 *   patch:
 *     tags: [Vehículos]
 *     summary: Actualizar vehículo
 *     description: Requiere rol admin o vendedor.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               marca: { type: string }
 *               modelo: { type: string }
 *               anio: { type: integer }
 *               patente: { type: string }
 *               color: { type: string }
 *               kilometraje: { type: integer }
 *               precio: { type: number }
 *               estado: { type: string }
 *               sucursalId: { type: integer }
 *     responses:
 *       200: { description: Vehículo actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.patch('/:id', authenticate, authorize('admin', 'vendedor'), validateBody(updateVehiculoSchema), VehiculoController.update);

/**
 * @openapi
 * /vehiculos/{id}/transferir:
 *   post:
 *     tags: [Vehículos]
 *     summary: Transferir vehículo a otra sucursal
 *     description: Requiere rol admin o vendedor. Genera un movimiento de transferencia.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sucursalDestinoId]
 *             properties:
 *               sucursalDestinoId: { type: integer }
 *               motivo: { type: string }
 *     responses:
 *       200: { description: Vehículo transferido, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.post('/:id/transferir', authenticate, authorize('admin', 'vendedor'), VehiculoController.transferir);

/**
 * @openapi
 * /vehiculos/{id}:
 *   delete:
 *     tags: [Vehículos]
 *     summary: Eliminar vehículo (soft delete)
 *     description: Requiere rol admin.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authenticate, authorize('admin'), VehiculoController.delete);

export default router;
