import { Router } from 'express';
import { TasacionController } from '../controllers/TasacionController';
import { ComprobanteController } from '../controllers/ComprobanteController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createTasacionSchema } from '../validation/tasacion.schema';

const router = Router();

/**
 * @openapi
 * /tasaciones:
 *   get:
 *     tags: [Tasaciones]
 *     summary: Listado de tasaciones de usados (paginado, búsqueda por marca/modelo/dominio/cliente)
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: condicion, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado paginado de tasaciones }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', authorize('admin', 'vendedor'), TasacionController.getAll);

/**
 * @openapi
 * /tasaciones/{id}:
 *   get:
 *     tags: [Tasaciones]
 *     summary: Detalle de una tasación
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Tasación }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', authorize('admin', 'vendedor'), TasacionController.getById);

/**
 * @openapi
 * /tasaciones/{id}/pdf:
 *   get:
 *     tags: [Tasaciones]
 *     summary: PDF de la tasación (para entregar al cliente)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: PDF de la tasación, content: { application/pdf: {} } }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/pdf', authorize('admin', 'vendedor'), ComprobanteController.tasacionPdf);

/**
 * @openapi
 * /tasaciones:
 *   post:
 *     tags: [Tasaciones]
 *     summary: Registrar una tasación de un usado
 *     description: El tasador se toma del usuario logueado (no del body). Solo admin/vendedor.
 *     responses:
 *       201: { description: Tasación registrada }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', authorize('admin', 'vendedor'), validateBody(createTasacionSchema), TasacionController.create);

/**
 * @openapi
 * /tasaciones/{id}:
 *   delete:
 *     tags: [Tasaciones]
 *     summary: Eliminar una tasación
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin', 'vendedor'), TasacionController.delete);

export default router;
