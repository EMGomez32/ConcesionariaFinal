import { Router } from 'express';
import { PrivacidadController } from '../controllers/PrivacidadController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { costosoLimiter } from '../middlewares/rateLimiters';
import {
    suprimirTitularSchema,
    motivoSchema,
    revocarConsentimientoSchema,
    crearSolicitudTitularSchema,
    actualizarSolicitudTitularSchema,
} from '../validation/privacidad.schema';

/**
 * Derechos del titular de los datos (Ley 25.326 arts. 14-16; PRIV-05).
 *
 * Todo es de ADMIN salvo la revocación del consentimiento, que también puede registrar
 * el vendedor: es quien escucha el "no me llamen más" en el mostrador o por teléfono, y
 * hacerlo esperar a un admin es dejar que lo sigan llamando. El vendedor puro sólo la
 * registra sobre clientes de su cartera (lo recorta el servicio).
 *
 * Las rutas se registran en una sola línea con su `authorize`, como pide el centinela
 * de permisos (tests/integration/permisos-mutaciones.test.ts).
 */
const router = Router();

/**
 * @openapi
 * /privacidad/clientes/{id}/informe:
 *   get:
 *     tags: [Privacidad]
 *     summary: Informe de datos del titular (derecho de acceso, art. 14)
 *     description: Sólo admin. JSON descargable con todo lo que se guarda de la persona (ficha, seguimientos, atenciones, tasaciones, presupuestos, reservas, ventas, financiaciones con cuotas, solicitudes de financiación con la lista de adjuntos sin binarios, postventa, conversaciones y mensajes, consentimiento). Queda en la auditoría.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Informe JSON (attachment) }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/clientes/:id/informe', costosoLimiter, authorize('admin'), PrivacidadController.informe);

/**
 * @openapi
 * /privacidad/clientes/{id}/suprimir:
 *   post:
 *     tags: [Privacidad]
 *     summary: Suprimir (anonimizar) los datos del titular — IRREVERSIBLE
 *     description: Sólo admin. Exige motivo y confirmacion=SUPRIMIR. Si el cliente tiene operaciones que la ley obliga a conservar (ventas, comprobantes AFIP, reservas, financiaciones sin cancelar, unidades que entregó), la supresión es parcial y la respuesta lo explica.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [motivo, confirmacion]
 *             properties:
 *               motivo: { type: string }
 *               confirmacion: { type: string, enum: [SUPRIMIR] }
 *     responses:
 *       200: { description: Resultado (modo total|parcial, qué se conservó y por qué) }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: Ya estaba suprimido (TITULAR_SUPRIMIDO) }
 */
router.post('/clientes/:id/suprimir', authorize('admin'), validateBody(suprimirTitularSchema), PrivacidadController.suprimir);

/**
 * @openapi
 * /privacidad/clientes/{id}/revocar-consentimiento:
 *   post:
 *     tags: [Privacidad]
 *     summary: Registrar que el titular revocó el consentimiento de contacto
 *     description: admin/vendedor (el vendedor puro, sólo sobre su cartera). Saca al cliente de la agenda de seguimientos.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Ficha actualizada }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/clientes/:id/revocar-consentimiento', authorize('admin', 'vendedor'), validateBody(revocarConsentimientoSchema), PrivacidadController.revocarConsentimiento);

/**
 * @openapi
 * /privacidad/clientes/{id}/bloquear:
 *   post:
 *     tags: [Privacidad]
 *     summary: Bloquear los datos del titular (art. 16)
 *     description: Sólo admin, con motivo. No se lo contacta ni aparece como contactable.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Ficha actualizada }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/clientes/:id/bloquear', authorize('admin'), validateBody(motivoSchema), PrivacidadController.bloquear);

/**
 * @openapi
 * /privacidad/clientes/{id}/desbloquear:
 *   post:
 *     tags: [Privacidad]
 *     summary: Levantar el bloqueo (no aplica a fichas suprimidas)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Ficha actualizada }
 *       409: { description: La ficha fue suprimida (TITULAR_SUPRIMIDO) }
 */
router.post('/clientes/:id/desbloquear', authorize('admin'), validateBody(motivoSchema), PrivacidadController.desbloquear);

/**
 * @openapi
 * /privacidad/solicitudes:
 *   get:
 *     tags: [Privacidad]
 *     summary: Registro de pedidos de los titulares
 *     description: Sólo admin. Ordenado por vencimiento. `vencidas` cuenta las abiertas con el plazo legal vencido.
 *     parameters:
 *       - { name: estado, in: query, schema: { type: string, enum: [pendiente, en_curso, resuelta, rechazada] } }
 *       - { name: tipo, in: query, schema: { type: string, enum: [acceso, rectificacion, supresion, bloqueo, oposicion] } }
 *       - { name: abiertas, in: query, schema: { type: boolean } }
 *       - { name: clienteId, in: query, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado paginado }
 *   post:
 *     tags: [Privacidad]
 *     summary: Registrar un pedido (calcula el vencimiento legal)
 *     responses:
 *       201: { description: Pedido registrado }
 */
router.get('/solicitudes', authorize('admin'), PrivacidadController.listarSolicitudes);
router.post('/solicitudes', authorize('admin'), validateBody(crearSolicitudTitularSchema), PrivacidadController.crearSolicitud);

/**
 * @openapi
 * /privacidad/solicitudes/{id}:
 *   get:
 *     tags: [Privacidad]
 *     summary: Un pedido del registro
 *   patch:
 *     tags: [Privacidad]
 *     summary: Avanzar un pedido (resuelta/rechazada exigen la resolución escrita)
 */
router.get('/solicitudes/:id', authorize('admin'), PrivacidadController.obtenerSolicitud);
router.patch('/solicitudes/:id', authorize('admin'), validateBody(actualizarSolicitudTitularSchema), PrivacidadController.actualizarSolicitud);

export default router;
