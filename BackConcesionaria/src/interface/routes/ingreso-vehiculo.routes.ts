import { Router } from 'express';
import { IngresoVehiculoController } from '../controllers/IngresoVehiculoController';

const router = Router();

/**
 * @openapi
 * /vehiculo-ingresos:
 *   get:
 *     tags: [Vehículos]
 *     summary: Listar ingresos de vehículos
 *     description: Acepta filtros startDate y endDate (ISO 8601) sobre el campo `fecha`.
 *     parameters:
 *       - { $ref: '#/components/parameters/pageParam' }
 *       - { $ref: '#/components/parameters/limitParam' }
 *       - { name: startDate, in: query, schema: { type: string, format: date }, description: 'Fecha inicial (ISO)' }
 *       - { name: endDate, in: query, schema: { type: string, format: date }, description: 'Fecha final (ISO)' }
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
router.get('/', IngresoVehiculoController.getAll);

/**
 * @openapi
 * /vehiculo-ingresos/{id}:
 *   get:
 *     tags: [Vehículos]
 *     summary: Obtener ingreso por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Ingreso encontrado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', IngresoVehiculoController.getById);

/**
 * @openapi
 * /vehiculo-ingresos:
 *   post:
 *     tags: [Vehículos]
 *     summary: Registrar ingreso de vehículo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehiculoId, fecha]
 *             properties:
 *               vehiculoId: { type: integer }
 *               fecha: { type: string, format: date-time }
 *               tipo: { type: string }
 *               proveedorId: { type: integer, nullable: true }
 *               montoCompra: { type: number }
 *               observaciones: { type: string }
 *     responses:
 *       201: { description: Ingreso creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/', IngresoVehiculoController.create);

/**
 * @openapi
 * /vehiculo-ingresos/{id}:
 *   delete:
 *     tags: [Vehículos]
 *     summary: Eliminar ingreso (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', IngresoVehiculoController.delete);

export default router;
