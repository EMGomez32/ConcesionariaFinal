import { Router } from 'express';
import { TasacionController } from '../controllers/TasacionController';
import { ComprobanteController } from '../controllers/ComprobanteController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createTasacionSchema, updateTasacionSchema } from '../validation/tasacion.schema';

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
router.get('/', authorize('admin', 'vendedor', 'tasador'), TasacionController.getAll);

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
router.get('/:id', authorize('admin', 'vendedor', 'tasador'), TasacionController.getById);

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
router.get('/:id/pdf', authorize('admin', 'vendedor', 'tasador'), ComprobanteController.tasacionPdf);

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
router.post('/', authorize('admin', 'vendedor', 'tasador'), validateBody(createTasacionSchema), TasacionController.create);

/**
 * @openapi
 * /tasaciones/{id}:
 *   patch:
 *     tags: [Tasaciones]
 *     summary: Completar/actualizar una tasación (el tasador le pone el valor a una pendiente)
 *     description: >-
 *       Actualiza la MISMA tasación (no crea otra). Poner el valor es "tasar":
 *       donde la concesionaria configuró `tasacionSoloTasador`, sólo admin puede.
 *       El estado y el tasador los deriva el servidor. Solo admin/vendedor.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Tasación actualizada }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { description: El valor lo carga el tasador (tasacionSoloTasador) }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', authorize('admin', 'vendedor', 'tasador'), validateBody(updateTasacionSchema), TasacionController.update);

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
