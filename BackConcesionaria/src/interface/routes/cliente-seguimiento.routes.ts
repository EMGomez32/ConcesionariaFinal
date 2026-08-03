import { Router } from 'express';
import { ClienteSeguimientoController } from '../controllers/ClienteSeguimientoController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createSeguimientoSchema } from '../validation/cliente-seguimiento.schema';

const router = Router();

/**
 * @openapi
 * /cliente-seguimientos/cliente/{clienteId}:
 *   get:
 *     tags: [CRM]
 *     summary: Bitácora de seguimiento de un cliente
 *     parameters:
 *       - { name: clienteId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado de contactos, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/cliente/:clienteId', ClienteSeguimientoController.getByCliente);

/**
 * @openapi
 * /cliente-seguimientos:
 *   post:
 *     tags: [CRM]
 *     summary: Registrar un contacto de seguimiento
 *     description: El autor se toma del usuario logueado (no del body). Solo admin/vendedor.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clienteId, tipo, fecha, nota]
 *             properties:
 *               clienteId: { type: integer }
 *               tipo: { type: string, enum: [llamada, whatsapp, email, visita, otro] }
 *               fecha: { type: string, format: date }
 *               nota: { type: string }
 *               proximoContacto: { type: string, format: date, nullable: true }
 *     responses:
 *       201: { description: Seguimiento registrado }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/', authorize('admin', 'vendedor'), validateBody(createSeguimientoSchema), ClienteSeguimientoController.create);

/**
 * @openapi
 * /cliente-seguimientos/{id}:
 *   delete:
 *     tags: [CRM]
 *     summary: Eliminar un seguimiento
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin', 'vendedor'), ClienteSeguimientoController.delete);

export default router;
