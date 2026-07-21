import { Router } from 'express';
import { PresupuestoController } from '../controllers/PresupuestoController';
import { authorize } from '../middlewares/authorize.middleware';
import * as presupuestoValidation from '../../modules/presupuestos/presupuesto.validation';
import { validate } from '../../middlewares/validate';

const router = Router();

/**
 * @openapi
 * /presupuestos:
 *   get:
 *     tags: [Presupuestos]
 *     summary: Listar presupuestos
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
router.get('/', PresupuestoController.getAll);

/**
 * @openapi
 * /presupuestos/{id}:
 *   get:
 *     tags: [Presupuestos]
 *     summary: Obtener presupuesto por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Presupuesto encontrado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', PresupuestoController.getById);

/**
 * @openapi
 * /presupuestos/{id}/total:
 *   get:
 *     tags: [Presupuestos]
 *     summary: Total del presupuesto (items + extras − canje)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Cálculo de totales
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 presupuestoId: { type: integer }
 *                 subtotalItems: { type: number }
 *                 subtotalExtras: { type: number }
 *                 valorCanje: { type: number }
 *                 total: { type: number }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/total', PresupuestoController.total);

/**
 * @openapi
 * /presupuestos:
 *   post:
 *     tags: [Presupuestos]
 *     summary: Crear presupuesto
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clienteId]
 *             properties:
 *               clienteId: { type: integer }
 *               vendedorId: { type: integer, nullable: true }
 *               vigencia: { type: string, format: date }
 *               observaciones: { type: string }
 *               items: { type: array, items: { type: object } }
 *               extras: { type: array, items: { type: object } }
 *               canje: { type: object, nullable: true }
 *     responses:
 *       201: { description: Presupuesto creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', authorize('admin', 'vendedor'), presupuestoValidation.createPresupuesto, validate, PresupuestoController.create);

/**
 * @openapi
 * /presupuestos/{id}:
 *   patch:
 *     tags: [Presupuestos]
 *     summary: Actualizar presupuesto
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vigencia: { type: string, format: date }
 *               observaciones: { type: string }
 *               estado: { type: string }
 *     responses:
 *       200: { description: Presupuesto actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.patch('/:id', authorize('admin', 'vendedor'), presupuestoValidation.updatePresupuesto, validate, PresupuestoController.update);

/**
 * @openapi
 * /presupuestos/{id}/convertir-en-venta:
 *   post:
 *     tags: [Presupuestos]
 *     summary: Convertir presupuesto en venta
 *     description: Crea una nueva venta a partir del presupuesto y marca este último como convertido.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               formaPago: { type: string }
 *               observaciones: { type: string }
 *     responses:
 *       201: { description: Venta creada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.post('/:id/convertir-en-venta', authorize('admin', 'vendedor'), PresupuestoController.convertToVenta);

/**
 * @openapi
 * /presupuestos/{id}:
 *   delete:
 *     tags: [Presupuestos]
 *     summary: Eliminar presupuesto (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin'), PresupuestoController.delete);

export default router;
