import { Router } from 'express';
import { ConcesionariaController } from '../controllers/ConcesionariaController';
import { authorize } from '../middlewares/authorize.middleware';

const router = Router();

// El `authenticate` global (routes/index.ts) ya corrió antes de montar esto.

// ── Autogestión del tenant propio (antes del gate super_admin y de /:id) ──────
// `/me` opera sobre la concesionaria del token, no sobre un id arbitrario:
//   - GET: cualquier usuario del tenant puede ver sus datos (Configuración).
//   - PATCH: sólo admin puede editarlos.
// Van primero para que Express no capture "me" como el parámetro :id.
/**
 * @openapi
 * /concesionarias/me:
 *   get:
 *     tags: [Concesionarias]
 *     summary: Datos de la concesionaria propia
 *     description: Devuelve la concesionaria del usuario autenticado (tenant del token).
 *     responses:
 *       200: { description: Concesionaria propia, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Concesionarias]
 *     summary: Actualizar la concesionaria propia
 *     description: admin del tenant. Sólo nombre, cuit, email, telefono, direccion.
 *     responses:
 *       200: { description: Concesionaria actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/me', ConcesionariaController.getMine);
router.patch('/me', authorize('admin'), ConcesionariaController.updateMine);

// A partir de acá, todo administra los TENANTS y es sólo para super_admin: sin
// esta guarda, cualquier admin de una concesionaria podía listar, crear o borrar
// las de todas (Concesionaria es modelo global y esquiva el filtro RLS de
// tenant). El controller no chequeaba rol, así que la restricción vive acá.
router.use(authorize('super_admin'));

/**
 * @openapi
 * /concesionarias:
 *   get:
 *     tags: [Concesionarias]
 *     summary: Listar concesionarias
 *     description: super_admin only. Devuelve todas las concesionarias (tenants) con paginación.
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
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', ConcesionariaController.getAll);

/**
 * @openapi
 * /concesionarias/{id}:
 *   get:
 *     tags: [Concesionarias]
 *     summary: Obtener concesionaria por id
 *     description: super_admin only.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Concesionaria encontrada
 *         content: { application/json: { schema: { type: object } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', ConcesionariaController.getById);

/**
 * @openapi
 * /concesionarias:
 *   post:
 *     tags: [Concesionarias]
 *     summary: Crear concesionaria
 *     description: super_admin only. Crea un nuevo tenant.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string }
 *               cuit: { type: string }
 *               direccion: { type: string }
 *               telefono: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       201:
 *         description: Concesionaria creada
 *         content: { application/json: { schema: { type: object } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/', ConcesionariaController.create);

/**
 * @openapi
 * /concesionarias/{id}:
 *   patch:
 *     tags: [Concesionarias]
 *     summary: Actualizar concesionaria
 *     description: super_admin only.
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
 *               cuit: { type: string }
 *               direccion: { type: string }
 *               telefono: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Concesionaria actualizada
 *         content: { application/json: { schema: { type: object } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', ConcesionariaController.update);

/**
 * @openapi
 * /concesionarias/{id}:
 *   delete:
 *     tags: [Concesionarias]
 *     summary: Eliminar concesionaria (soft delete)
 *     description: super_admin only.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', ConcesionariaController.delete);

export default router;
