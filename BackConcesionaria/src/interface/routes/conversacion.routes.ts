import { Router } from 'express';
import { ConversacionController } from '../controllers/ConversacionController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { crearMensajeSchema, updateConversacionSchema } from '../validation/whatsapp.schema';

const router = Router();

// Bandeja compartida admin + vendedor. El recorte fino es del service: un
// vendedor PURO (rol vendedor sin admin/super_admin) sólo ve y atiende los hilos
// asignados a él o sin asignar — vale igual en el listado, el detalle y el envío.

/**
 * @openapi
 * /conversaciones:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Bandeja de conversaciones de WhatsApp
 *     description: >
 *       Ordenada por actividad más reciente. Un vendedor puro sólo ve las suyas
 *       o las sin asignar.
 *     parameters:
 *       - { in: query, name: estado, schema: { type: string, enum: [abierta, cerrada, archivada] } }
 *       - { in: query, name: asignadoAId, schema: { type: integer } }
 *       - { in: query, name: sinResponder, schema: { type: boolean }, description: Sólo hilos cuyo último mensaje es del contacto }
 *       - { in: query, name: q, schema: { type: string }, description: Busca por teléfono, nombre del contacto o nombre del cliente }
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
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       telefono: { type: string }
 *                       nombreContacto: { type: string, nullable: true }
 *                       estado: { type: string }
 *                       noLeidos: { type: integer }
 *                       ultimoMensajeAt: { type: string, format: date-time }
 *                       ultimoMensajeDir: { type: string, enum: [entrante, saliente] }
 *                       cliente: { type: object, nullable: true }
 *                       asignadoA: { type: object, nullable: true }
 *                       ultimoMensaje: { type: string, nullable: true }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 totalPages: { type: integer }
 *                 totalResults: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', authorize('admin', 'vendedor'), ConversacionController.getAll);

/**
 * @openapi
 * /conversaciones/{id}:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Conversación con sus últimos 100 mensajes (orden cronológico)
 *     description: Efecto lateral - abrir el hilo lo marca como leído (noLeidos = 0).
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Conversación + mensajes, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', authorize('admin', 'vendedor'), ConversacionController.getById);

/**
 * @openapi
 * /conversaciones/{id}/mensajes:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Encolar un mensaje saliente
 *     description: >
 *       NO envía en el request. Crea el mensaje en estado `pendiente` y le
 *       reserva un turno (`enviarAt`) con el espaciado anti-ban del número: una
 *       ráfaga de mensajes es la forma más rápida de que Meta banee la línea.
 *       El worker es el único que despacha.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contenido]
 *             properties:
 *               contenido: { type: string, maxLength: 4096 }
 *     responses:
 *       201:
 *         description: Mensaje encolado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *                 estado: { type: string, example: pendiente }
 *                 enviarAt: { type: string, format: date-time }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: El número está desactivado o pausado por salud de entrega }
 */
router.post('/:id/mensajes', authorize('admin', 'vendedor'), validateBody(crearMensajeSchema), ConversacionController.crearMensaje);

/**
 * @openapi
 * /conversaciones/{id}:
 *   patch:
 *     tags: [WhatsApp]
 *     summary: Cerrar/archivar/reabrir el hilo y asignarlo a un vendedor
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado: { type: string, enum: [abierta, cerrada, archivada] }
 *               asignadoAId: { type: integer, nullable: true, description: null des-asigna el hilo }
 *     responses:
 *       200: { description: Conversación actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', authorize('admin', 'vendedor'), validateBody(updateConversacionSchema), ConversacionController.update);

/**
 * @openapi
 * /conversaciones/{id}/registrar-consulta:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Convertir el hilo en una consulta (lead) y vincularlo al cliente
 *     description: >
 *       Reusa la ingesta común de consultas (dedupe por teléfono + asignación
 *       round-robin) con origen `whatsapp` y el último mensaje entrante como
 *       texto. Deja la conversación vinculada al cliente resultante.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Lead ingerido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clienteId: { type: integer }
 *                 creado: { type: boolean, description: false si el teléfono ya era un cliente }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/registrar-consulta', authorize('admin', 'vendedor'), ConversacionController.registrarConsulta);

export default router;
