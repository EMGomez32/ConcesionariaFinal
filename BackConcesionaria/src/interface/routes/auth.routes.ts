import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { loginLimiter } from '../middlewares/rateLimiters';
import { validateBody } from '../middlewares/validate.middleware';
import { loginSchema, refreshSchema, resetPasswordSchema } from '../validation/auth.schema';

const router = Router();

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Iniciar sesión
 *     description: Devuelve el perfil del usuario y un par de tokens (access + refresh). La auditoría registra `accion=login` con IP y userAgent.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginRequest' }
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LoginResponse' }
 *       401:
 *         description: Credenciales inválidas
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       403:
 *         description: Usuario inactivo
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.post('/login', loginLimiter, validateBody(loginSchema), AuthController.login);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Renovar access token
 *     description: Intercambia un refresh token válido por un nuevo access token.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Nuevo par de tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access: { type: string }
 *                 refresh: { type: string }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/refresh', validateBody(refreshSchema), AuthController.refresh);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Cerrar sesión
 *     description: Registra `accion=logout` en auditoría.
 *     responses:
 *       204:
 *         description: OK (sin contenido)
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/logout', AuthController.logout);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Solicitar recuperación de contraseña
 *     description: Envía por email un link de un solo uso. Responde 200 aunque el email no exista (no revela usuarios).
 *     security: []
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [email], properties: { email: { type: string } } } } }
 *     responses:
 *       200: { description: Respuesta genérica }
 */
router.post('/forgot-password', loginLimiter, AuthController.forgotPassword);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Restablecer contraseña con token
 *     security: []
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [token, password], properties: { token: { type: string }, password: { type: string } } } } }
 *     responses:
 *       200: { description: Contraseña actualizada }
 *       400: { description: Token inválido o expirado }
 */
router.post('/reset-password', validateBody(resetPasswordSchema), AuthController.resetPassword);

export default router;
