import { Router } from 'express';
import { MercadoLibreController } from '../controllers/MercadoLibreController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { publicarSchema, responderSchema, asignarSchema, leadSchema } from '../validation/mercadolibre.schema';

const router = Router();

// Reparto de permisos — el gating es POR RUTA (ojo al agregar rutas nuevas: sin
// authorize quedan abiertas a cualquier autenticado):
//   - admin: todo lo que vincula la cuenta, cuesta plata o toca una publicación
//     (vincular/desvincular, opciones, publicar, pausar/reactivar/cerrar/
//     sincronizar) y el reparto de la bandeja (asignar preguntas).
//   - admin + vendedor: la bandeja de preguntas y lo que se hace con una
//     pregunta (responder, convertirla en lead). El recorte fino lo aplica el
//     controller: un vendedor PURO sólo ve y atiende las asignadas a él o sin
//     asignar, y no puede filtrar por el asignadoAId de otro.
//   - cualquier autenticado: SÓLO leer la publicación de un vehículo, porque es
//     parte de la ficha que ve todo el equipo (el router /api ya exige JWT).

/**
 * @openapi
 * /mercadolibre/cuenta:
 *   get:
 *     tags: [Mercado Libre]
 *     summary: Estado de la vinculación con Mercado Libre
 *     description: >
 *       `configurada` dice si el SERVIDOR tiene ML_CLIENT_ID/ML_CLIENT_SECRET:
 *       sin eso no hay OAuth posible y el panel muestra el aviso en vez de un
 *       botón de vincular que no puede funcionar. `conectada` dice si además hay
 *       una cuenta vinculada y activa. Los tokens no se exponen nunca.
 *     responses:
 *       200:
 *         description: Estado de la integración
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configurada: { type: boolean }
 *                 conectada: { type: boolean }
 *                 cuenta:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     id: { type: integer }
 *                     mlUserId: { type: string }
 *                     nickname: { type: string, nullable: true }
 *                     siteId: { type: string, example: MLA }
 *                     activa: { type: boolean }
 *                     ultimoError: { type: string, nullable: true, description: Motivo del último fallo (p. ej. refresh rechazado - hay que re-autorizar) }
 *                     expiraEn: { type: string, format: date-time }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/cuenta', authorize('admin'), MercadoLibreController.getCuenta);

/**
 * @openapi
 * /mercadolibre/vincular:
 *   post:
 *     tags: [Mercado Libre]
 *     summary: Obtener la URL de autorización de Mercado Libre
 *     description: >
 *       No vincula nada todavía: devuelve el link al que hay que mandar el
 *       navegador. El vínculo se cierra en el callback público
 *       (GET /api/webhooks/mercadolibre/callback), que canjea el `code` y
 *       redirige de vuelta a /configuracion?ml=ok|error.
 *     responses:
 *       200:
 *         description: URL de autorización
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url: { type: string, format: uri }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: Faltan ML_CLIENT_ID/ML_CLIENT_SECRET en el servidor }
 */
router.post('/vincular', authorize('admin'), MercadoLibreController.vincular);

/**
 * @openapi
 * /mercadolibre/cuenta/{id}:
 *   delete:
 *     tags: [Mercado Libre]
 *     summary: Desvincular la cuenta de Mercado Libre
 *     description: >
 *       Borra los tokens y da de baja la cuenta (soft-delete): las publicaciones
 *       y preguntas ya ingeridas se conservan, pero deja de poder publicar y
 *       responder en nombre del vendedor.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Cuenta desvinculada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/cuenta/:id', authorize('admin'), MercadoLibreController.desvincular);

/**
 * @openapi
 * /mercadolibre/vehiculos/{vehiculoId}/opciones:
 *   get:
 *     tags: [Mercado Libre]
 *     summary: Qué hace falta para publicar el vehículo y cuánto sale cada tipo
 *     description: >
 *       Los tipos de publicación y sus costos se consultan EN VIVO a Mercado
 *       Libre (varían por precio y categoría), así que el usuario elige sabiendo
 *       cuánto va a pagar. `atributosFaltantes` y `advertencias` son los motivos
 *       por los que la publicación podría salir incompleta o fallar (por ejemplo
 *       fotos servidas desde localhost, que ML no puede descargar).
 *     parameters:
 *       - { name: vehiculoId, in: path, required: true, schema: { type: integer } }
 *       - { name: concesionariaId, in: query, schema: { type: integer }, description: Sólo para super_admin - define con qué cuenta de Mercado Libre se opera. Para el resto sale del token }
 *     responses:
 *       200:
 *         description: Opciones de publicación
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vehiculoId: { type: integer }
 *                 titulo: { type: string }
 *                 categoriaId: { type: string, nullable: true }
 *                 categoriaNombre: { type: string, nullable: true }
 *                 precio: { type: number, nullable: true }
 *                 moneda: { type: string }
 *                 fotos: { type: integer }
 *                 atributosFaltantes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       nombre: { type: string }
 *                 advertencias: { type: array, items: { type: string } }
 *                 tipos:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       listingTypeId: { type: string, example: gold_special }
 *                       nombre: { type: string }
 *                       costoPublicacion: { type: number, nullable: true }
 *                       comisionVenta: { type: number, nullable: true }
 *                       moneda: { type: string }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: No hay una cuenta de Mercado Libre vinculada }
 */
router.get('/vehiculos/:vehiculoId/opciones', authorize('admin'), MercadoLibreController.opciones);

/**
 * @openapi
 * /mercadolibre/vehiculos/{vehiculoId}/publicar:
 *   post:
 *     tags: [Mercado Libre]
 *     summary: Publicar el vehículo en Mercado Libre
 *     description: >
 *       Unidad por unidad y siempre a pedido: publicar tiene un costo que depende
 *       del `listingTypeId` elegido, por eso nunca es un efecto automático del
 *       alta del vehículo. El precio y la moneda salen de la ficha, no del body.
 *     parameters:
 *       - { name: vehiculoId, in: path, required: true, schema: { type: integer } }
 *       - { name: concesionariaId, in: query, schema: { type: integer }, description: Sólo para super_admin - define con qué cuenta de Mercado Libre se publica. Para el resto sale del token }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [listingTypeId]
 *             properties:
 *               listingTypeId: { type: string, description: Uno de los tipos devueltos por /opciones }
 *               titulo: { type: string, maxLength: 60, description: Si falta, se arma con marca, modelo, versión y año }
 *               categoriaId: { type: string, description: Si falta, la resuelve el predictor de categorías de ML }
 *     responses:
 *       201: { description: Publicación creada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: No hay cuenta vinculada, o Mercado Libre rechazó el ítem }
 */
router.post('/vehiculos/:vehiculoId/publicar', authorize('admin'), validateBody(publicarSchema), MercadoLibreController.publicar);

/**
 * @openapi
 * /mercadolibre/vehiculos/{vehiculoId}/publicacion:
 *   get:
 *     tags: [Mercado Libre]
 *     summary: Publicación del vehículo (null si nunca se publicó)
 *     description: >
 *       Lectura para cualquier usuario autenticado - es parte de la ficha del
 *       vehículo. Con `null` el panel muestra el botón "Publicar".
 *     parameters:
 *       - { name: vehiculoId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Publicación o null
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               nullable: true
 *               properties:
 *                 id: { type: integer }
 *                 itemId: { type: string, nullable: true }
 *                 permalink: { type: string, nullable: true }
 *                 estado: { type: string, enum: [borrador, activa, pausada, cerrada, error] }
 *                 listingTypeId: { type: string }
 *                 titulo: { type: string }
 *                 precioPublicado: { type: number, nullable: true }
 *                 monedaPublicada: { type: string, nullable: true }
 *                 ultimoError: { type: string, nullable: true }
 *                 ultimaSyncAt: { type: string, format: date-time, nullable: true }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/vehiculos/:vehiculoId/publicacion', MercadoLibreController.getPublicacion);

/**
 * @openapi
 * /mercadolibre/publicaciones/{id}/pausar:
 *   post:
 *     tags: [Mercado Libre]
 *     summary: Pausar la publicación (deja de mostrarse, no se cierra)
 *     description: Es lo mismo que hace solo el worker cuando el vehículo pasa a reservado.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Publicación actualizada, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/publicaciones/:id/pausar', authorize('admin'), MercadoLibreController.pausar);

/**
 * @openapi
 * /mercadolibre/publicaciones/{id}/reactivar:
 *   post:
 *     tags: [Mercado Libre]
 *     summary: Reactivar una publicación pausada
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Publicación actualizada, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/publicaciones/:id/reactivar', authorize('admin'), MercadoLibreController.reactivar);

/**
 * @openapi
 * /mercadolibre/publicaciones/{id}/cerrar:
 *   post:
 *     tags: [Mercado Libre]
 *     summary: Cerrar la publicación (definitivo)
 *     description: >
 *       En Mercado Libre cerrar NO tiene vuelta atrás: para volver a vender la
 *       unidad hay que publicarla de nuevo, y pagar de nuevo. Es lo que hace solo
 *       el worker cuando el vehículo pasa a vendido.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Publicación cerrada, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/publicaciones/:id/cerrar', authorize('admin'), MercadoLibreController.cerrar);

/**
 * @openapi
 * /mercadolibre/publicaciones/{id}/sincronizar:
 *   post:
 *     tags: [Mercado Libre]
 *     summary: Reconciliar la publicación con Mercado Libre
 *     description: >
 *       Espeja el estado real del ítem en ML y le vuelve a empujar el precio y el
 *       estado actuales del vehículo. Botón manual del mismo trabajo que hace el
 *       worker; sirve para no esperar el próximo ciclo.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Publicación sincronizada, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: La publicación nunca llegó a Mercado Libre (no tiene itemId) }
 */
router.post('/publicaciones/:id/sincronizar', authorize('admin'), MercadoLibreController.sincronizarPublicacion);

/**
 * @openapi
 * /mercadolibre/preguntas:
 *   get:
 *     tags: [Mercado Libre]
 *     summary: Bandeja de preguntas de Mercado Libre
 *     description: >
 *       Un vendedor puro sólo ve las asignadas a él o sin asignar, y el
 *       `asignadoAId` de la query se le ignora (si no, sería una forma trivial de
 *       espiar los leads de un compañero).
 *     parameters:
 *       - { in: query, name: estado, schema: { type: string, enum: [sin_responder, respondida, eliminada] } }
 *       - { in: query, name: asignadoAId, schema: { type: integer }, description: Sólo para admin }
 *       - { in: query, name: soloMias, schema: { type: boolean }, description: Asignadas a mí o sin asignar }
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
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/preguntas', authorize('admin', 'vendedor'), MercadoLibreController.getPreguntas);

/**
 * @openapi
 * /mercadolibre/preguntas/{id}/responder:
 *   post:
 *     tags: [Mercado Libre]
 *     summary: Responder la pregunta (la respuesta se publica en Mercado Libre)
 *     description: >
 *       La respuesta queda pública en la publicación y ML no permite borrarla:
 *       un vendedor puro sólo puede responder las asignadas a él o sin asignar.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [texto]
 *             properties:
 *               texto: { type: string, maxLength: 2000 }
 *     responses:
 *       200: { description: Pregunta respondida, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { description: La pregunta está asignada a otro vendedor }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/preguntas/:id/responder', authorize('admin', 'vendedor'), validateBody(responderSchema), MercadoLibreController.responder);

/**
 * @openapi
 * /mercadolibre/preguntas/{id}/asignar:
 *   post:
 *     tags: [Mercado Libre]
 *     summary: Asignar la pregunta a un vendedor (o devolverla a la cola común)
 *     description: Repartir la bandeja es del admin; por eso el vendedor no puede auto-asignarse acá.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [usuarioId]
 *             properties:
 *               usuarioId: { type: integer, nullable: true, description: null des-asigna la pregunta }
 *     responses:
 *       200: { description: Pregunta actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/preguntas/:id/asignar', authorize('admin'), validateBody(asignarSchema), MercadoLibreController.asignar);

/**
 * @openapi
 * /mercadolibre/preguntas/{id}/lead:
 *   post:
 *     tags: [Mercado Libre]
 *     summary: Convertir la pregunta en consulta (lead) del CRM
 *     description: >
 *       Reusa la ingesta común de consultas (dedupe por teléfono/email +
 *       asignación round-robin) con origen `mercadolibre`. Mercado Libre no
 *       expone el teléfono ni el email del preguntador: si el vendedor los
 *       consiguió por chat, los manda acá.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               telefono: { type: string }
 *               email: { type: string, format: email }
 *               vendedorId: { type: integer, nullable: true, description: Si falta, se asigna por round-robin }
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
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { description: La pregunta está asignada a otro vendedor }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/preguntas/:id/lead', authorize('admin', 'vendedor'), validateBody(leadSchema), MercadoLibreController.crearLead);

/**
 * @openapi
 * /mercadolibre/sincronizar:
 *   post:
 *     tags: [Mercado Libre]
 *     summary: Forzar una pasada de ingesta de preguntas
 *     description: >
 *       El worker ya la corre periódicamente y las notificaciones llegan por
 *       webhook; esto es el "actualizar ahora" del panel para no esperar el
 *       próximo ciclo (y la red de seguridad si el webhook no llegó).
 *     parameters:
 *       - { name: concesionariaId, in: query, schema: { type: integer }, description: Sólo para super_admin - de qué concesionaria se sincroniza. Para el resto sale del token }
 *     responses:
 *       200:
 *         description: Resultado de la ingesta
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nuevas: { type: integer }
 *                 fallidas: { type: integer, description: Preguntas que ML devolvió y no se pudieron guardar (el detalle queda en el log) }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: No hay una cuenta de Mercado Libre vinculada }
 */
router.post('/sincronizar', authorize('admin'), MercadoLibreController.sincronizarAhora);

export default router;
