import { Router } from 'express';
import { ReservaController } from '../controllers/ReservaController';
import { ComprobanteController } from '../controllers/ComprobanteController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { cancelarReservaSchema, createReservaSchema, updateReservaSchema } from '../validation/reserva.schema';
import { costosoLimiter } from '../middlewares/rateLimiters';

/**
 * CRITERIO DE PERMISOS: quien HACE el trabajo lo REGISTRA; ANULAR es del admin,
 * porque borrar una seña es una de las operaciones con las que se tapa un desvío.
 * `super_admin` tiene bypass en authorize(), no hace falta nombrarlo.
 *
 * Toda ruta que MUTA lleva `authorize(...)`: `router.use(authenticate)` sólo
 * exige sesión, no rol, y los controllers no miran roles. Sin esto, el perfil
 * `lectura` crea y cancela reservas por curl.
 *
 * SALVEDAD IMPORTANTE para el que venga a tocar esto: acá el verbo HTTP no
 * alcanza para aplicar "anular es del admin". `DeleteReserva` NO es un hard
 * delete —cancela, libera el vehículo y registra el movimiento— y `UpdateReserva`
 * con estado 'cancelada' o 'vencida' hace exactamente lo mismo. El front usa
 * SIEMPRE el PATCH; el DELETE hoy no lo llama nadie.
 *
 * Por eso, desde PROC-33, "anular es del admin" se chequea POR CAMPO dentro de
 * UpdateReserva (`problemaDeCambioDeReserva`) y, antes de validar el body, en
 * `ReservaController.gateCampos`: cancelar y cambiar el monto son del admin (con
 * motivo al cancelar); marcar vencida, sólo con la fecha ya pasada. La ruta sigue
 * en admin+vendedor porque extender el vencimiento y las observaciones son del
 * vendedor.
 */

const router = Router();

/**
 * @openapi
 * /reservas:
 *   get:
 *     tags: [Reservas]
 *     summary: Listar reservas
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
router.get('/', ReservaController.getAll);

/**
 * @openapi
 * /reservas/{id}:
 *   get:
 *     tags: [Reservas]
 *     summary: Obtener reserva por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Reserva encontrada, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', ReservaController.getById);

/**
 * @openapi
 * /reservas/{id}/comprobante:
 *   get:
 *     tags: [Reservas]
 *     summary: Comprobante de reserva/seña en PDF
 *     description: PDF con los datos de la reserva (cliente, vehículo, seña) y la marca de la concesionaria.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: PDF del comprobante, content: { application/pdf: {} } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/comprobante', costosoLimiter, ComprobanteController.reservaPdf);

/**
 * @openapi
 * /reservas:
 *   post:
 *     tags: [Reservas]
 *     summary: Crear reserva con seña
 *     description: Marca el vehículo como reservado y registra el movimiento. Requiere rol admin o vendedor.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehiculoId, clienteId, monto]
 *             properties:
 *               vehiculoId: { type: integer }
 *               clienteId: { type: integer }
 *               monto: { type: number }
 *               fecha: { type: string, format: date-time }
 *               vencimiento: { type: string, format: date-time }
 *               observaciones: { type: string }
 *     responses:
 *       201: { description: Reserva creada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.post('/', authorize('admin', 'vendedor'), validateBody(createReservaSchema), ReservaController.create);

/**
 * @openapi
 * /reservas/{id}:
 *   patch:
 *     tags: [Reservas]
 *     summary: Actualizar reserva
 *     description: >
 *       Requiere rol admin o vendedor. Cancelar (estado `cancelada`, con `motivo`
 *       obligatorio) y cambiar el `monto` son sólo admin. `vencida` sólo si la
 *       fecha de vencimiento ya pasó. El vendedor puede extender el vencimiento,
 *       no moverlo a una fecha pasada.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado: { type: string }
 *               monto: { type: number }
 *               fechaVencimiento: { type: string, format: date }
 *               observaciones: { type: string }
 *               motivo: { type: string, description: 'Obligatorio si estado = cancelada' }
 *     responses:
 *       200: { description: Reserva actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// Ésta es la ruta por la que el front cancela reservas (no el DELETE). La ruta queda
// en admin+vendedor; los CAMPOS de admin los corta `gateCampos` antes de validar el
// body (un 403 no puede depender de que el vendedor haya mandado el motivo).
router.patch('/:id', authorize('admin', 'vendedor'), ReservaController.gateCampos, validateBody(updateReservaSchema), ReservaController.update);

/**
 * @openapi
 * /reservas/{id}:
 *   delete:
 *     tags: [Reservas]
 *     summary: Cancelar reserva
 *     description: >
 *       Libera el vehículo y genera un movimiento `liberacion_reserva`. Requiere rol
 *       admin y `motivo` (mínimo 10 caracteres) en el body.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [motivo]
 *             properties:
 *               motivo: { type: string, minLength: 10, maxLength: 500 }
 *     responses:
 *       204: { description: Reserva cancelada }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
// admin, por el criterio de cabecera. Pero leé la salvedad de arriba antes de
// creer que con esto "anular quedó cerrado": el front cancela por el PATCH.
router.delete('/:id', authorize('admin'), validateBody(cancelarReservaSchema), ReservaController.delete);

export default router;
