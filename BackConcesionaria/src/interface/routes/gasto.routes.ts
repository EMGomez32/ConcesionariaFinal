import { Router } from 'express';
import { GastoController } from '../controllers/GastoController';
import { authorize } from '../middlewares/authorize.middleware';

const router = Router();

/**
 * @openapi
 * /gastos:
 *   get:
 *     tags: [Gastos]
 *     summary: Listar gastos vehiculares
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
router.get('/', GastoController.getAll);

// /total antes de /:id para que Express no tome "total" como id.
/**
 * @openapi
 * /gastos/total:
 *   get:
 *     tags: [Gastos]
 *     summary: Total agregado de gastos vehiculares
 *     description: Acepta filtros opcionales por vehiculoId, categoriaId, proveedorId.
 *     parameters:
 *       - { name: vehiculoId, in: query, schema: { type: integer } }
 *       - { name: categoriaId, in: query, schema: { type: integer } }
 *       - { name: proveedorId, in: query, schema: { type: integer } }
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
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/total', GastoController.total);

/**
 * @openapi
 * /gastos/{id}:
 *   get:
 *     tags: [Gastos]
 *     summary: Obtener gasto por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Gasto encontrado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', GastoController.getById);

/**
 * @openapi
 * /gastos:
 *   post:
 *     tags: [Gastos]
 *     summary: Registrar gasto vehicular
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehiculoId, monto]
 *             properties:
 *               vehiculoId: { type: integer }
 *               categoriaId: { type: integer, nullable: true }
 *               proveedorId: { type: integer, nullable: true }
 *               monto: { type: number }
 *               fecha: { type: string, format: date-time }
 *               descripcion: { type: string }
 *     responses:
 *       201: { description: Gasto creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/', authorize('admin', 'vendedor'), GastoController.create);

/**
 * @openapi
 * /gastos/{id}:
 *   patch:
 *     tags: [Gastos]
 *     summary: Actualizar gasto
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               categoriaId: { type: integer, nullable: true }
 *               proveedorId: { type: integer, nullable: true }
 *               monto: { type: number }
 *               fecha: { type: string, format: date-time }
 *               descripcion: { type: string }
 *     responses:
 *       200: { description: Gasto actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', authorize('admin', 'vendedor'), GastoController.update);

/**
 * @openapi
 * /gastos/{id}:
 *   delete:
 *     tags: [Gastos]
 *     summary: Eliminar gasto (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin'), GastoController.delete);

export default router;
