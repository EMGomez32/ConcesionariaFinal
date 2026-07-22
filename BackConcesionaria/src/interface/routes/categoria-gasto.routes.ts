import { Router } from 'express';
import { CategoriaGastoController } from '../controllers/CategoriaGastoController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createCategoriaGastoSchema, updateCategoriaGastoSchema } from '../validation/categoria-gasto.schema';

const router = Router();

/**
 * @openapi
 * /gastos-categorias:
 *   get:
 *     tags: [Gastos]
 *     summary: Listar categorías de gasto vehicular
 *     responses:
 *       200: { description: Listado, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', CategoriaGastoController.getAll);

/**
 * @openapi
 * /gastos-categorias:
 *   post:
 *     tags: [Gastos]
 *     summary: Crear categoría de gasto vehicular
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string }
 *               descripcion: { type: string }
 *     responses:
 *       201: { description: Categoría creada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/', authorize('admin'), validateBody(createCategoriaGastoSchema), CategoriaGastoController.create);

/**
 * @openapi
 * /gastos-categorias/{id}:
 *   patch:
 *     tags: [Gastos]
 *     summary: Actualizar categoría de gasto vehicular
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               descripcion: { type: string }
 *               activo: { type: boolean }
 *     responses:
 *       200: { description: Categoría actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch('/:id', authorize('admin'), validateBody(updateCategoriaGastoSchema), CategoriaGastoController.update);

/**
 * @openapi
 * /gastos-categorias/{id}:
 *   delete:
 *     tags: [Gastos]
 *     summary: Eliminar categoría de gasto vehicular
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.delete('/:id', authorize('admin'), CategoriaGastoController.delete);

export default router;
