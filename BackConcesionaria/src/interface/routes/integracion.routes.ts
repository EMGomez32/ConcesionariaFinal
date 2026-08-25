import { Router } from 'express';
import { IntegracionController } from '../controllers/IntegracionController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createIntegracionSchema, updateIntegracionSchema } from '../validation/integracion.schema';

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
