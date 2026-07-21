import { Router } from 'express';
import { TipoPostventaController } from '../controllers/TipoPostventaController';
import { authorize } from '../middlewares/authorize.middleware';
import * as tipoValidation from '../../modules/postventa-tipos/tipo.validation';
import { validate } from '../../middlewares/validate';

const router = Router();

/**
 * @openapi
 * /postventa-tipos:
 *   get:
 *     tags: [Postventa]
 *     summary: Listar tipos de reclamo (catálogo)
 *     description: Incluye `casosCount` con la cantidad de casos que usan cada tipo.
 *     responses:
 *       200: { description: Listado, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', TipoPostventaController.getAll);

/**
 * @openapi
 * /postventa-tipos:
 *   post:
 *     tags: [Postventa]
 *     summary: Crear tipo de reclamo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string, maxLength: 60 }
 *               activo: { type: boolean, default: true }
 *     responses:
 *       201: { description: Creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { description: Ya existe un tipo con ese nombre }
 */
router.post('/', authorize('admin', 'postventa'), tipoValidation.createTipoPostventa, validate, TipoPostventaController.create);

/**
 * @openapi
 * /postventa-tipos/{id}:
 *   patch:
 *     tags: [Postventa]
 *     summary: Renombrar o archivar un tipo de reclamo
 *     description: >
 *       Renombrar arrastra a todos los casos que lo usan, porque apuntan por id.
 *       `activo: false` lo saca del alta pero lo conserva en los casos históricos.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string, maxLength: 60 }
 *               activo: { type: boolean }
 *     responses:
 *       200: { description: Actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: Ya existe un tipo con ese nombre }
 */
router.patch('/:id', authorize('admin', 'postventa'), tipoValidation.updateTipoPostventa, validate, TipoPostventaController.update);

/**
 * @openapi
 * /postventa-tipos/{id}:
 *   delete:
 *     tags: [Postventa]
 *     summary: Eliminar tipo de reclamo (sólo si no lo usa ningún caso)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       400: { description: El tipo está en uso; archivalo con activo=false }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin'), TipoPostventaController.delete);

export default router;
