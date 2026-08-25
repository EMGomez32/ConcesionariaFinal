import { Router } from 'express';
import { ConversacionController } from '../controllers/ConversacionController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { crearMensajeSchema, registrarConsultaSchema, updateConversacionSchema } from '../validation/conversacion.schema';

const router = Router();

// Bandeja compartida admin + vendedor. El recorte fino es del service: un
// vendedor PURO (rol vendedor sin admin/super_admin) sólo ve y atiende los hilos
// asignados a él o sin asignar — vale igual en el listado, el detalle y el envío,
// y vale igual en TODOS los canales (el filtro es por asignadoAId, no por canal:
// un DM de Instagram sin asignar se comporta como un WhatsApp sin asignar).

/**
 * @openapi
 * /conversaciones:
 *   get:
 *     tags: [Bandeja]
 *     summary: Bandeja multi-canal de conversaciones
 *     description: >
 *       Una sola lista con WhatsApp, los DM de Instagram y Messenger y los
 *       comentarios de Instagram y de la página de Facebook, ordenada por
 *       actividad más reciente. Cada hilo trae su `canal` para etiquetarlo.
 *       Un vendedor puro sólo ve las suyas o las sin asignar.
 *     parameters:
 *       - { in: query, name: estado, schema: { type: string, enum: [abierta, cerrada, archivada] } }
 *       - { in: query, name: canal, schema: { type: string, enum: [whatsapp, instagram, messenger, instagram_comentario, facebook_comentario] }, description: Filtra por canal. Sin este parámetro entran todos }
 *       - { in: query, name: asignadoAId, schema: { type: integer } }
 *       - { in: query, name: sinResponder, schema: { type: boolean }, description: Sólo hilos cuyo último mensaje es del contacto }
 *       - { in: query, name: q, schema: { type: string }, description: Busca por teléfono, nombre del contacto, nombre del cliente o id externo de Meta }
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
 *                       canal: { type: string, enum: [whatsapp, instagram, messenger, instagram_comentario, facebook_comentario] }
 *                       telefono: { type: string, nullable: true, description: Sólo WhatsApp - un DM de Instagram no tiene teléfono }
 *                       nombreContacto: { type: string, nullable: true }
 *                       estado: { type: string }
 *                       noLeidos: { type: integer }
 *                       ultimoMensajeAt: { type: string, format: date-time }
 *                       ultimoMensajeDir: { type: string, enum: [entrante, saliente] }
 *                       ventanaVenceAt: { type: string, format: date-time, nullable: true, description: Cierre de la ventana de 24 h de Meta. null en WhatsApp y en comentarios }
 *                       whatsappCuentaId: { type: integer, nullable: true }
 *                       integracionId: { type: integer, nullable: true }
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
 *     tags: [Bandeja]
 *     summary: Conversación con sus últimos 100 mensajes (orden cronológico)
 *     description: >
 *       Efecto lateral - abrir el hilo lo marca como leído (noLeidos = 0).
 *       Trae `envio` con todo lo que el composer necesita para decidir si deja
 *       escribir: si se puede enviar, por qué no (en criollo), si la respuesta
 *       es pública y el tope de caracteres del canal.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Conversación + mensajes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *                 canal: { type: string }
 *                 envio:
 *                   type: object
 *                   description: Condiciones del composer, ya resueltas por el backend.
 *                   properties:
 *                     canal: { type: string }
 *                     puedeEnviar: { type: boolean, description: false - deshabilitar el composer y mostrar motivo }
 *                     motivo: { type: string, nullable: true, description: Por qué no se puede escribir, redactado para mostrar TAL CUAL. Nunca un código de Meta }
 *                     aplicaVentana: { type: boolean, description: false en WhatsApp y en comentarios - no hay plazo que mostrar }
 *                     ventanaVenceAt: { type: string, format: date-time, nullable: true, description: Cuándo se cierra la ventana de 24 h }
 *                     respuestaPublica: { type: boolean, description: true en comentarios - lo que se escriba queda a la vista de todos }
 *                     limiteCaracteres: { type: integer, description: Tope del canal (WhatsApp 4096, Messenger 2000, DM de Instagram 1000, comentarios 8000) }
 *                 mensajes: { type: array, items: { type: object } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', authorize('admin', 'vendedor'), ConversacionController.getById);

/**
 * @openapi
 * /conversaciones/{id}/mensajes:
 *   post:
 *     tags: [Bandeja]
 *     summary: Encolar un mensaje saliente (el canal lo decide el hilo)
 *     description: >
 *       NO envía en el request. Crea el mensaje en estado `pendiente` y lo deja
 *       listo para el worker, que lo despacha por el canal de la conversación.
 *       El body es el mismo para todos los canales - el backend sabe por dónde sale.
 *
 *       En WhatsApp le reserva un turno (`enviarAt`) con el espaciado anti-ban del
 *       número: una ráfaga de mensajes es la forma más rápida de que Meta banee la
 *       línea. En los canales de Meta sale en el tick siguiente (sus límites son
 *       cuotas de la app, no un riesgo de ban), pero antes se valida la ventana de
 *       24 h: si está cerrada NO se llama a la API y se devuelve 409.
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
 *               contenido:
 *                 type: string
 *                 maxLength: 8000
 *                 description: >
 *                   El tope real es por canal (WhatsApp 4096, Messenger 2000, DM de
 *                   Instagram 1000, comentarios 8000) y se valida al encolar.
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
 *       400:
 *         description: >
 *           Body inválido, o texto más largo que el tope del canal
 *           (`errorCode` MENSAJE_DEMASIADO_LARGO).
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409:
 *         description: >
 *           No se puede enviar por una regla del canal, con `message` ya redactado
 *           en criollo para mostrar TAL CUAL (nunca un código de Meta).
 *           `errorCode`- VENTANA_META_CERRADA (pasaron 24 h desde el último
 *           mensaje de la persona), META_CANAL_NO_CONFIGURADO (al hilo le falta
 *           el destino o la integración), WHATSAPP_CUENTA_INACTIVA,
 *           WHATSAPP_CUENTA_PAUSADA.
 */
router.post('/:id/mensajes', authorize('admin', 'vendedor'), validateBody(crearMensajeSchema), ConversacionController.crearMensaje);

/**
 * @openapi
 * /conversaciones/{id}:
 *   patch:
 *     tags: [Bandeja]
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
 *     tags: [Bandeja]
 *     summary: Convertir el hilo en una consulta (lead) y vincularlo al cliente
 *     description: >
 *       Reusa la ingesta común de consultas (dedupe por teléfono + asignación
 *       round-robin) con el último mensaje entrante como texto, y el origen que
 *       corresponde al canal - whatsapp, instagram (DM y comentarios de IG) o
 *       facebook (Messenger y comentarios de la página). Deja la conversación
 *       vinculada al cliente resultante.
 *
 *       En los canales sin teléfono el dedupe no tiene por dónde agarrar, así que
 *       si el hilo ya quedó vinculado a un cliente se respeta ese vínculo en vez
 *       de crear una ficha nueva.
 *
 *       El body es OPCIONAL - en WhatsApp el hilo ya trae nombre y teléfono. En
 *       los canales de Meta puede no traer ninguno de los dos (un DM de Instagram
 *       no tiene teléfono y el nombre depende de un permiso que puede no estar
 *       aprobado), así que el vendedor los completa y viajan acá. Lo que se manda
 *       se guarda también en la conversación si el hilo todavía no lo tenía.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string, maxLength: 150, description: Nombre del contacto cargado a mano }
 *               telefono: { type: string, maxLength: 40, description: Teléfono cargado a mano - habilita el dedupe contra clientes existentes }
 *     responses:
 *       200:
 *         description: Lead ingerido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clienteId: { type: integer }
 *                 creado: { type: boolean, description: false si el contacto ya era un cliente }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/registrar-consulta', authorize('admin', 'vendedor'), validateBody(registrarConsultaSchema), ConversacionController.registrarConsulta);

export default router;
