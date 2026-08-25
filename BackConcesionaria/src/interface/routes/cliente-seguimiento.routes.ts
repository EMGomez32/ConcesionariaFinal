import { Router } from 'express';
import { ClienteSeguimientoController } from '../controllers/ClienteSeguimientoController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createSeguimientoSchema, marcarProximoSchema } from '../validation/cliente-seguimiento.schema';

const router = Router();

/**
 * @openapi
 * /cliente-seguimientos/cliente/{clienteId}:
 *   get:
 *     tags: [CRM]
 *     summary: Bitácora de seguimiento de un cliente
 *     description: Solo admin/vendedor, igual que el alta y la baja.
 *     parameters:
 *       - { name: clienteId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado de contactos, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
// El único GET del archivo que lleva authorize, y a propósito: la bitácora no es
// un dato de ficha, es la nota libre del vendedor sobre la negociación ("regatea",
// "está viendo en la competencia", "hablar con la esposa"). El POST, el PATCH y el
// DELETE ya eran admin/vendedor; el GET había quedado abierto, así que el perfil
// `lectura` —el contador externo, el socio— leía la estrategia comercial completa
// desde la pestaña Seguimiento de cualquier cliente, sin siquiera usar curl.
router.get('/cliente/:clienteId', authorize('admin', 'vendedor'), ClienteSeguimientoController.getByCliente);

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

/**
 * @openapi
 * /cliente-seguimientos/{id}/proximo-hecho:
 *   patch:
 *     tags: [CRM]
 *     summary: Marcar el próximo contacto como realizado (sale de la agenda)
 *     description: Sin body marca como realizado; { hecho:false } reabre. Solo admin/vendedor.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hecho: { type: boolean, default: true }
 *     responses:
 *       200: { description: Seguimiento actualizado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/proximo-hecho', authorize('admin', 'vendedor'), validateBody(marcarProximoSchema), ClienteSeguimientoController.marcarProximo);

export default router;
