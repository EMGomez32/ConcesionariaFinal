import { Router } from 'express';
import { ProveedorController } from '../controllers/ProveedorController';
import { authorize } from '../middlewares/authorize.middleware';
import * as proveedorValidation from '../../modules/proveedores/proveedor.validation';
import { validate } from '../../middlewares/validate';

const router = Router();

/**
 * @openapi
 * /proveedores:
 *   get:
 *     tags: [Proveedores]
 *     summary: Listar proveedores
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
router.get('/', ProveedorController.getAll);

/**
 * @openapi
 * /proveedores/{id}:
 *   get:
 *     tags: [Proveedores]
 *     summary: Obtener proveedor por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Proveedor encontrado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', ProveedorController.getById);

/**
 * @openapi
 * /proveedores:
 *   post:
 *     tags: [Proveedores]
 *     summary: Crear proveedor
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string }
 *               cuit: { type: string }
 *               email: { type: string, format: email }
 *               telefono: { type: string }
 *               direccion: { type: string }
 *     responses:
 *       201: { description: Proveedor creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/', authorize('admin', 'vendedor'), proveedorValidation.createProveedor, validate, ProveedorController.create);

/**
 * @openapi
 * /proveedores/{id}:
 *   patch:
 *     tags: [Proveedores]
 *     summary: Actualizar proveedor
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
 *               cuit: { type: string }
 *               email: { type: string, format: email }
 *               telefono: { type: string }
 *               direccion: { type: string }
 *     responses:
 *       200: { description: Proveedor actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', authorize('admin', 'vendedor'), proveedorValidation.updateProveedor, validate, ProveedorController.update);

/**
 * @openapi
 * /proveedores/{id}:
 *   delete:
 *     tags: [Proveedores]
 *     summary: Eliminar proveedor (soft delete con guarda)
 *     description: Si el proveedor tiene gastos asociados, la operación falla con 409.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.delete('/:id', authorize('admin'), ProveedorController.delete);

export default router;
