import { Router } from 'express';
import { GastoFijoController } from '../controllers/GastoFijoController';
import { authorize } from '../middlewares/authorize.middleware';
import * as gastoFijoValidation from '../../modules/gastos-fijos/gasto-fijo.validation';
import { validate } from '../../middlewares/validate';

const router = Router();

/**
 * @openapi
 * /gastos-fijos:
 *   get:
 *     tags: [Gastos]
 *     summary: Listar gastos fijos
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
router.get('/', GastoFijoController.getAll);

/**
 * @openapi
 * /gastos-fijos/total:
 *   get:
 *     tags: [Gastos]
 *     summary: Total agregado de gastos fijos por período
 *     description: El parámetro `anio` es obligatorio. Acepta filtros mes, sucursalId, categoriaId.
 *     parameters:
 *       - { name: anio, in: query, required: true, schema: { type: integer } }
 *       - { name: mes, in: query, schema: { type: integer } }
 *       - { name: sucursalId, in: query, schema: { type: integer } }
 *       - { name: categoriaId, in: query, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Total y conteo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: number }
 *                 count: { type: integer }
 *                 filters: { type: object }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/total', GastoFijoController.total);

/**
 * @openapi
 * /gastos-fijos/{id}:
 *   get:
 *     tags: [Gastos]
 *     summary: Obtener gasto fijo por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Gasto fijo encontrado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', GastoFijoController.getById);

/**
 * @openapi
 * /gastos-fijos:
 *   post:
 *     tags: [Gastos]
 *     summary: Crear gasto fijo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [categoriaId, descripcion, monto, anio, mes]
 *             properties:
 *               categoriaId: { type: integer }
 *               descripcion: { type: string }
 *               monto: { type: number }
 *               moneda: { type: string, enum: [ARS, USD], default: ARS }
 *               anio: { type: integer }
 *               mes: { type: integer, minimum: 1, maximum: 12 }
 *               sucursalId: { type: integer, nullable: true }
 *               proveedorId: { type: integer, nullable: true }
 *               comprobanteUrl: { type: string, nullable: true }
 *     responses:
 *       201: { description: Gasto fijo creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', authorize('admin'), gastoFijoValidation.createGastoFijo, validate, GastoFijoController.create);

/**
 * @openapi
 * /gastos-fijos/{id}:
 *   patch:
 *     tags: [Gastos]
 *     summary: Actualizar gasto fijo
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               categoriaId: { type: integer }
 *               descripcion: { type: string }
 *               monto: { type: number }
 *               moneda: { type: string, enum: [ARS, USD] }
 *               anio: { type: integer }
 *               mes: { type: integer, minimum: 1, maximum: 12 }
 *               sucursalId: { type: integer, nullable: true }
 *               proveedorId: { type: integer, nullable: true }
 *               comprobanteUrl: { type: string, nullable: true }
 *     responses:
 *       200: { description: Gasto fijo actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', authorize('admin'), gastoFijoValidation.updateGastoFijo, validate, GastoFijoController.update);

/**
 * @openapi
 * /gastos-fijos/{id}:
 *   delete:
 *     tags: [Gastos]
 *     summary: Eliminar gasto fijo (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin'), GastoFijoController.delete);

export default router;
