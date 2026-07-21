import { Router } from 'express';
import { CategoriaGastoFijoController } from '../controllers/CategoriaGastoFijoController';
import { authorize } from '../middlewares/authorize.middleware';

const router = Router();

/**
 * @openapi
 * /gastos-fijos-categorias:
 *   get:
 *     tags: [Gastos]
 *     summary: Listar categorías de gasto fijo
 *     responses:
 *       200: { description: Listado, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', CategoriaGastoFijoController.getAll);

/**
 * @openapi
 * /gastos-fijos-categorias:
 *   post:
 *     tags: [Gastos]
 *     summary: Crear categoría de gasto fijo
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
router.post('/', authorize('admin'), CategoriaGastoFijoController.create);

/**
 * @openapi
 * /gastos-fijos-categorias/{id}:
 *   patch:
 *     tags: [Gastos]
 *     summary: Actualizar categoría de gasto fijo (renombrar o archivar)
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
 *               activo: { type: boolean, description: Archiva la categoría sin borrarla }
 *     responses:
 *       200: { description: Actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', authorize('admin'), CategoriaGastoFijoController.update);

/**
 * @openapi
 * /gastos-fijos-categorias/{id}:
 *   delete:
 *     tags: [Gastos]
 *     summary: Eliminar categoría de gasto fijo
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.delete('/:id', authorize('admin'), CategoriaGastoFijoController.delete);

export default router;
