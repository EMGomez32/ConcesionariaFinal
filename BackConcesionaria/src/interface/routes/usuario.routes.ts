import { Router } from 'express';
import { UsuarioController } from '../controllers/UsuarioController';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createUsuarioSchema, updateUsuarioSchema, resetUsuarioPasswordSchema, updateMeSchema, changeMyPasswordSchema } from '../validation/usuario.schema';

const router = Router();

/**
 * @openapi
 * /usuarios:
 *   get:
 *     tags: [Usuarios]
 *     summary: Listar usuarios
 *     description: Aislado por concesionariaId (RLS). super_admin ve todos.
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
router.get('/', authenticate, UsuarioController.getAll);

// ── Autogestión: cualquier usuario logueado sobre SU PROPIA cuenta ────────────
// Van antes de /:id para que "me" no se interprete como un id. No llevan
// authorize(...): el id sale del token, así que no hay riesgo de tocar a otro.
/**
 * @openapi
 * /usuarios/me:
 *   patch:
 *     tags: [Usuarios]
 *     summary: Actualizar el perfil propio
 *     description: Cualquier usuario autenticado. Sólo nombre y email.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Perfil actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch('/me', authenticate, validateBody(updateMeSchema), UsuarioController.updateMe);

/**
 * @openapi
 * /usuarios/me/password:
 *   post:
 *     tags: [Usuarios]
 *     summary: Cambiar la contraseña propia
 *     description: Cualquier usuario autenticado. Verifica la contraseña actual.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 6 }
 *     responses:
 *       204: { description: Contraseña cambiada }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/me/password', authenticate, validateBody(changeMyPasswordSchema), UsuarioController.changeMyPassword);

/**
 * @openapi
 * /usuarios/{id}:
 *   get:
 *     tags: [Usuarios]
 *     summary: Obtener usuario por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Usuario encontrado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', authenticate, UsuarioController.getById);

/**
 * @openapi
 * /usuarios:
 *   post:
 *     tags: [Usuarios]
 *     summary: Crear usuario
 *     description: Requiere rol admin o super_admin.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, email, password]
 *             properties:
 *               nombre: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               roles: { type: array, items: { type: string } }
 *               sucursalId: { type: integer, nullable: true }
 *               concesionariaId: { type: integer, nullable: true }
 *     responses:
 *       201: { description: Usuario creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/', authenticate, authorize('admin', 'super_admin'), validateBody(createUsuarioSchema), UsuarioController.create);

/**
 * @openapi
 * /usuarios/{id}:
 *   patch:
 *     tags: [Usuarios]
 *     summary: Actualizar usuario
 *     description: Requiere rol admin o super_admin.
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
 *               email: { type: string, format: email }
 *               roles: { type: array, items: { type: string } }
 *               sucursalId: { type: integer, nullable: true }
 *               activo: { type: boolean }
 *     responses:
 *       200: { description: Usuario actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', authenticate, authorize('admin', 'super_admin'), validateBody(updateUsuarioSchema), UsuarioController.update);

/**
 * @openapi
 * /usuarios/{id}/reset-password:
 *   post:
 *     tags: [Usuarios]
 *     summary: Resetear contraseña de un usuario
 *     description: Requiere rol admin o super_admin.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string, minLength: 6 }
 *     responses:
 *       204: { description: Password reseteada }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/reset-password', authenticate, authorize('admin', 'super_admin'), validateBody(resetUsuarioPasswordSchema), UsuarioController.resetPassword);

/**
 * @openapi
 * /usuarios/{id}:
 *   delete:
 *     tags: [Usuarios]
 *     summary: Eliminar usuario (soft delete)
 *     description: Requiere rol admin o super_admin.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authenticate, authorize('admin', 'super_admin'), UsuarioController.delete);

export default router;
