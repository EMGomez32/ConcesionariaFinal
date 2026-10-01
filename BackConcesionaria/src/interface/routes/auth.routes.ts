import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import {
    loginLimiter,
    loginAccountLimiter,
    forgotPasswordEmailLimiter,
    forgotPasswordIpLimiter,
    refreshLimiter,
    resetPasswordLimiter,
    mfaLoginLimiter,
    mfaLoginIpLimiter,
    mfaAccionLimiter,
} from '../middlewares/rateLimiters';
import { authenticate } from '../middlewares/authenticate.middleware';
import { MfaController } from '../controllers/MfaController';
import { validateBody } from '../middlewares/validate.middleware';
import { minResponseTime } from '../middlewares/minResponseTime.middleware';
import {
    loginSchema, refreshSchema, resetPasswordSchema, logoutSchema,
    login2faSchema, mfaSetupSchema, mfaEnableSchema, mfaDisableSchema, mfaRegenerarSchema,
} from '../validation/auth.schema';

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
router.post('/login', loginLimiter, loginAccountLimiter, validateBody(loginSchema), AuthController.login);

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
router.post('/refresh', refreshLimiter, validateBody(refreshSchema), AuthController.refresh);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Cerrar sesión
 *     description: Revoca el refresh token de la sesión (si se envía) y registra `accion=logout` en auditoría.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       204:
 *         description: OK (sin contenido)
 */
router.post('/logout', validateBody(logoutSchema), AuthController.logout);

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
// minResponseTime: mismo tiempo de respuesta exista o no el email (no enumerar cuentas).
router.post('/forgot-password', forgotPasswordIpLimiter, forgotPasswordEmailLimiter, minResponseTime(400), AuthController.forgotPassword);

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
router.post('/reset-password', resetPasswordLimiter, validateBody(resetPasswordSchema), AuthController.resetPassword);

// ── 2FA (TOTP) ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /auth/login/2fa:
 *   post:
 *     tags: [Auth]
 *     summary: Segundo paso del login con 2FA
 *     description: Con el mfaToken que devolvió /auth/login (5 min) y un código de la app o de recuperación. Devuelve la sesión.
 *     security: []
 */
router.post('/login/2fa', mfaLoginIpLimiter, mfaLoginLimiter, validateBody(login2faSchema), AuthController.login2fa);

// Las rutas de abajo son de la cuenta YA autenticada (el router /auth se monta antes del authenticate global).
router.get('/2fa/status', authenticate, MfaController.status);
router.post('/2fa/setup', authenticate, mfaAccionLimiter, validateBody(mfaSetupSchema), MfaController.setup);
router.post('/2fa/enable', authenticate, mfaAccionLimiter, validateBody(mfaEnableSchema), MfaController.enable);
router.post('/2fa/disable', authenticate, mfaAccionLimiter, validateBody(mfaDisableSchema), MfaController.disable);
router.post('/2fa/recovery-codes', authenticate, mfaAccionLimiter, validateBody(mfaRegenerarSchema), MfaController.regenerarCodigos);

export default router;
