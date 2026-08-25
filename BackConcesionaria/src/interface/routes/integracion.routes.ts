import { Router } from 'express';
import { IntegracionController } from '../controllers/IntegracionController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createIntegracionSchema, demoIntegracionSchema, updateIntegracionSchema } from '../validation/integracion.schema';

const router = Router();

// TODO el router es admin-only: `config` guarda credenciales de los canales
// (app secret de Meta, contraseña IMAP). super_admin pasa por el bypass.
router.use(authorize('admin'));

/**
 * @openapi
 * /integraciones:
 *   get:
 *     tags: [Integraciones]
 *     summary: Listar integraciones de canal (secretos enmascarados)
 *     description: >
 *       Cada integración incluye `canales`: el estado derivado de los canales de
 *       Meta (leadgen, messenger, instagram, facebook_comentario,
 *       instagram_comentario) según lo que haya cargado en `config`, con
 *       `habilitado`, `falta` (qué completar acá) y `enMeta` (qué suscribir o
 *       permitir en el portal de Meta). Vacío para las integraciones `email`.
 *       También trae `modo` (real|demo) y `demo`: una integración en modo
 *       demostración no se conecta con Meta y todo lo suyo va rotulado como
 *       simulado en la pantalla.
 *     responses:
 *       200:
 *         description: Listado (config con appSecret/pageAccessToken/instagramAccessToken/pass enmascarados)
 *         content:
 *           application/json:
 *             schema: { type: array, items: { type: object } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', IntegracionController.getAll);

// ── Modo demostración de Meta ────────────────────────────────────────────────
// ANTES que las rutas `/:id`: Express matchea por orden y un DELETE /demo caería
// en `/:id` con id = "demo", que parsea NaN y revienta contra Prisma. Si alguna
// vez se agrega otra ruta literal, va también acá arriba.
//
// Gating: lo cubre el `router.use(authorize('admin'))` de arriba — las tres son
// admin-only como el resto del router (encender la demostración crea filas y
// apagarla borra conversaciones de la bandeja de todo el equipo).

/**
 * @openapi
 * /integraciones/demo:
 *   post:
 *     tags: [Integraciones]
 *     summary: Activar el modo demostración de Instagram y Facebook
 *     description: >
 *       Crea una integración de Meta SIMULADA: no tiene tokens, no recibe
 *       webhooks y no puede hacer ninguna llamada a Meta. Existe porque los
 *       cuatro canales (DM de Instagram, Messenger, comentarios de Instagram y
 *       de Facebook) dependen del App Review de Meta, y hasta que salga la
 *       bandeja no se puede mostrar. Todo lo que genera va rotulado como
 *       simulado en la pantalla y los identificadores empiezan con DEMO-.
 *       Idempotente: si la demostración ya estaba activa devuelve 200 y la deja
 *       como está (si estaba apagada con el switch, la vuelve a encender).
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               concesionariaId: { type: integer, description: Sólo para super_admin - en qué concesionaria se activa. Para el resto sale del token }
 *     responses:
 *       201:
 *         description: Modo demostración activado. Devuelve la integración con la misma forma que GET /integraciones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *                 tipo: { type: string, enum: [meta] }
 *                 nombre: { type: string, example: Instagram y Facebook (demostración) }
 *                 activo: { type: boolean }
 *                 modo: { type: string, enum: [demo] }
 *                 demo: { type: boolean, example: true }
 *                 canales: { type: array, items: { type: object } }
 *                 creada: { type: boolean, description: false si la demostración ya estaba activa }
 *       200: { description: La demostración ya estaba activa (no se cambió nada) }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: La concesionaria ya tiene una integración de Meta REAL activa. Hay que desactivarla primero - si no, en la bandeja se mezclarían conversaciones de verdad con las simuladas }
 */
router.post('/demo', validateBody(demoIntegracionSchema), IntegracionController.activarDemo);

/**
 * @openapi
 * /integraciones/demo/conversaciones:
 *   post:
 *     tags: [Integraciones]
 *     summary: Generar las conversaciones de ejemplo de la demostración
 *     description: >
 *       Siembra cinco hilos sobre los cuatro canales de Meta, con mensajes de
 *       compradores de autos ficticios (nombres con el sufijo DEMO): un DM de
 *       Instagram con la ventana de 24 h abierta, un Messenger con la ventana por
 *       cerrarse, un DM de Instagram con la ventana YA VENCIDA (el composer
 *       aparece bloqueado, que es justo lo que hay que mostrar) y dos hilos de
 *       comentarios —uno de Instagram y uno de Facebook— donde la respuesta es
 *       pública. Se crean con la misma forma que les daría la ingesta real, así
 *       que responder, asignar y registrar la consulta recorren el código de
 *       verdad. Idempotente - las claves son deterministas: apretar dos veces no
 *       duplica nada, sólo vuelve a correr el reloj de los hilos ya sembrados
 *       para que la demostración se pueda repetir al día siguiente.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               concesionariaId: { type: integer, description: Sólo para super_admin - en qué concesionaria se siembran. Para el resto sale del token }
 *     responses:
 *       201:
 *         description: Conversaciones generadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 creadas: { type: integer }
 *                 yaExistian: { type: integer, description: Las que ya estaban sembradas (la siembra es idempotente); se reinician }
 *                 mensajesCreados: { type: integer }
 *                 respuestasDescartadas: { type: integer, description: Respuestas que el vendedor había escrito en la demostración anterior y se descartaron al reiniciar los hilos }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: El modo demostración no está activo en esta concesionaria }
 */
router.post('/demo/conversaciones', validateBody(demoIntegracionSchema), IntegracionController.sembrarConversacionesDemo);

/**
 * @openapi
 * /integraciones/demo:
 *   delete:
 *     tags: [Integraciones]
 *     summary: Salir del modo demostración y borrar todo lo simulado
 *     description: >
 *       Borrón y cuenta nueva: elimina la integración simulada JUNTO con TODAS
 *       sus conversaciones y mensajes de ejemplo, para poder repetir la
 *       demostración desde cero. El borrado es físico y en una sola transacción.
 *       Nada de eso existe fuera del sistema, así que en Meta no se toca nada.
 *       Los clientes que se hayan registrado como lead desde una conversación
 *       simulada NO se borran (la ingesta pudo haber actualizado un cliente REAL
 *       preexistente): quedan marcados con `origenSimulado`, fuera de los
 *       reportes, y se informan en `clientesConservados`.
 *     parameters:
 *       - { name: concesionariaId, in: query, schema: { type: integer }, description: Sólo para super_admin - de qué concesionaria se apaga. Para el resto sale del token }
 *     responses:
 *       200:
 *         description: Modo demostración desactivado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversacionesEliminadas: { type: integer }
 *                 mensajesEliminados: { type: integer }
 *                 clientesConservados: { type: integer, description: Clientes del CRM que nacieron de una conversación simulada y siguen ahí, rotulados }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: El modo demostración no está activo en esta concesionaria }
 */
router.delete('/demo', IntegracionController.desactivarDemo);

/**
 * @openapi
 * /integraciones:
 *   post:
 *     tags: [Integraciones]
 *     summary: Crear integración de canal
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tipo, nombre, config]
 *             properties:
 *               tipo: { type: string, enum: [meta, email] }
 *               nombre: { type: string }
 *               activo: { type: boolean }
 *               config:
 *                 type: object
 *                 description: >
 *                   meta: { origen (instagram|facebook), verifyToken, appSecret, pageAccessToken,
 *                   pageId?, igBusinessAccountId?, instagramAccessToken? } — los tres últimos son
 *                   opcionales y habilitan los canales nuevos: pageId → Messenger y comentarios de
 *                   la página; igBusinessAccountId → DM y comentarios de Instagram;
 *                   instagramAccessToken sólo si la app usa el flujo Instagram Login.
 *                   email: { origen (default deruedas), host, port (default 993),
 *                   secure (default true), user, pass, carpeta (default INBOX) }.
 *     responses:
 *       201: { description: Integración creada (config enmascarada), content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: 'tipo meta - la concesionaria está en modo demostración de Instagram y Facebook. Hay que salir del modo demostración primero (código META_DEMO_ACTIVA); si no, la bandeja mezclaría los hilos simulados con los mensajes reales' }
 */
router.post('/', validateBody(createIntegracionSchema), IntegracionController.create);

/**
 * @openapi
 * /integraciones/{id}:
 *   patch:
 *     tags: [Integraciones]
 *     summary: Actualizar integración de canal
 *     description: >
 *       `config` es parcial y se valida contra el tipo guardado (el tipo no se
 *       cambia). Un campo secreto que llega vacío u omitido conserva el valor guardado.
 *       Los ids opcionales de meta (pageId, igBusinessAccountId) NO son secretos:
 *       mandarlos en '' los BORRA (omitirlos los conserva).
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               activo: { type: boolean }
 *               config: { type: object }
 *     responses:
 *       200: { description: Integración actualizada (config enmascarada), content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: 'La integración es la simulada (no se edita por el CRUD - se apaga con Salir del modo demostración), o se está reactivando una integración meta REAL con la demostración encendida' }
 */
router.patch('/:id', validateBody(updateIntegracionSchema), IntegracionController.update);

/**
 * @openapi
 * /integraciones/{id}:
 *   delete:
 *     tags: [Integraciones]
 *     summary: Eliminar integración de canal (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', IntegracionController.delete);

export default router;
