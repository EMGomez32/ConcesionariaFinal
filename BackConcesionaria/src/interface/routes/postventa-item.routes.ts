import { Router } from 'express';
import { PostventaItemController } from '../controllers/PostventaItemController';
import { authorize } from '../middlewares/authorize.middleware';

import { validateBody } from '../middlewares/validate.middleware';
import { createItemSchema } from '../validation/postventa-item.schema';
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
router.post('/', authorize('admin', 'postventa'), validateBody(createItemSchema), PostventaItemController.create);

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

/*
 * Criterio de aceptación 7: `item.monto` es lo que se le pagó al proveedor por el
 * arreglo — costo puro. La ruta no tenía `authorize`. Se abre a `postventa`
 * porque es quien carga y controla esos ítems (sus altas ya eran admin+postventa),
 * y se cierra al vendedor.
 */
router.get('/caso/:casoId', authorize('admin', 'postventa'), PostventaItemController.getByCaso);

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
