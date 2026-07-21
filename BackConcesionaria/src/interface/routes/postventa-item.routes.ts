import { Router } from 'express';
import { PostventaItemController } from '../controllers/PostventaItemController';
import { authorize } from '../middlewares/authorize.middleware';
import * as itemValidation from '../../modules/postventa-items/item.validation';
import { validate } from '../../middlewares/validate';

const router = Router();

/**
 * @openapi
 * /postventa-items:
 *   post:
 *     tags: [Postventa]
 *     summary: Crear item de postventa
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [casoId, descripcion, monto]
 *             properties:
 *               casoId: { type: integer }
 *               descripcion: { type: string }
 *               monto: { type: number }
 *     responses:
 *       201: { description: Item creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/', authorize('admin', 'postventa'), itemValidation.createItem, validate, PostventaItemController.create);

/**
 * @openapi
 * /postventa-items/caso/{casoId}:
 *   get:
 *     tags: [Postventa]
 *     summary: Listar items de un caso
 *     parameters:
 *       - { name: casoId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado de items, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/caso/:casoId', PostventaItemController.getByCaso);

/**
 * @openapi
 * /postventa-items/{id}:
 *   delete:
 *     tags: [Postventa]
 *     summary: Eliminar item (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin', 'postventa'), PostventaItemController.delete);

export default router;
