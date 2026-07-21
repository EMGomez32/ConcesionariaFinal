import { Router } from 'express';
import { SucursalController } from '../controllers/SucursalController';
import { authorize } from '../middlewares/authorize.middleware';
import * as sucursalValidation from '../../modules/sucursales/sucursal.validation';
import { validate } from '../../middlewares/validate';

const router = Router();

/**
 * @openapi
 * /sucursales:
 *   get:
 *     tags: [Sucursales]
 *     summary: Listar sucursales
 *     parameters:
 *       - { $ref: '#/components/parameters/pageParam' }
 *       - { $ref: '#/components/parameters/limitParam' }
 *     responses:
 *       200: { description: Listado paginado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', SucursalController.getAll);

/**
 * @openapi
 * /sucursales/{id}:
 *   get:
 *     tags: [Sucursales]
 *     summary: Obtener sucursal por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Sucursal encontrada, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', SucursalController.getById);

/**
 * @openapi
 * /sucursales:
 *   post:
 *     tags: [Sucursales]
 *     summary: Crear sucursal
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string }
 *               direccion: { type: string }
 *               ciudad: { type: string }
 *               email: { type: string }
 *               telefono: { type: string }
 *     responses:
 *       201: { description: Sucursal creada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', authorize('admin'), sucursalValidation.createSucursal, validate, SucursalController.create);

/**
 * @openapi
 * /sucursales/{id}:
 *   patch:
 *     tags: [Sucursales]
 *     summary: Actualizar sucursal
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
 *               direccion: { type: string }
 *               ciudad: { type: string }
 *               email: { type: string }
 *               telefono: { type: string }
 *               activo: { type: boolean }
 *     responses:
 *       200: { description: Sucursal actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', authorize('admin'), sucursalValidation.updateSucursal, validate, SucursalController.update);

/**
 * @openapi
 * /sucursales/{id}:
 *   delete:
 *     tags: [Sucursales]
 *     summary: Eliminar sucursal (soft delete; rechaza si tiene relaciones vivas)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       400: { description: La sucursal tiene registros vinculados; desactivala }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin'), SucursalController.delete);

export default router;
