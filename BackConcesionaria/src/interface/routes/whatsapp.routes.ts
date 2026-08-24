import { Router } from 'express';
import { WhatsappController } from '../controllers/WhatsappController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createCuentaSchema } from '../validation/whatsapp.schema';

const router = Router();

// Vincular/desvincular un número es una operación de configuración del tenant
// (y expone un QR que da acceso a la cuenta de WhatsApp): admin-only en TODAS
// las rutas de este router. La bandeja —lo que usan los vendedores— vive en
// conversacion.routes.ts.

/**
 * @openapi
 * /whatsapp/cuentas:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Listar las cuentas de WhatsApp de la concesionaria
 *     description: >
 *       `estado` es el del socket vivo cuando lo hay (el proceso es la fuente de
 *       verdad); si no, el último persistido. `tieneSesion` indica si quedó
 *       sesión en disco: con sesión la cuenta reconecta sola, sin ella hay que
 *       escanear un QR.
 *     responses:
 *       200:
 *         description: Cuentas del tenant
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   alias: { type: string }
 *                   numero: { type: string, nullable: true }
 *                   estado: { type: string, enum: [desconectado, conectando, esperando_qr, conectado, reconectando, error] }
 *                   activa: { type: boolean }
 *                   ultimoError: { type: string, nullable: true }
 *                   saludEstado: { type: string, enum: [normal, ralentizado, pausado] }
 *                   tieneSesion: { type: boolean }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/cuentas', authorize('admin'), WhatsappController.getCuentas);

/**
 * @openapi
 * /whatsapp/cuentas:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Dar de alta una cuenta de WhatsApp (todavía sin vincular)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [alias]
 *             properties:
 *               alias: { type: string, description: Nombre interno del número (único por concesionaria) }
 *     responses:
 *       201: { description: Cuenta creada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { description: Ya existe una cuenta con ese alias }
 */
router.post('/cuentas', authorize('admin'), validateBody(createCuentaSchema), WhatsappController.createCuenta);

/**
 * @openapi
 * /whatsapp/cuentas/{id}/conectar:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Levantar el socket de la cuenta (arranca la vinculación por QR)
 *     description: >
 *       Devuelve el estado inmediato. El QR tarda un instante en generarse: el
 *       panel poletea GET /whatsapp/cuentas/{id}/estado hasta recibirlo.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Estado del proveedor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 estado: { type: string }
 *                 qr: { type: string, nullable: true, description: Data-URL del QR (sólo en esperando_qr) }
 *                 numero: { type: string, nullable: true }
 *                 error: { type: string, nullable: true }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: La cuenta está desactivada }
 */
router.post('/cuentas/:id/conectar', authorize('admin'), WhatsappController.conectar);

/**
 * @openapi
 * /whatsapp/cuentas/{id}/desconectar:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Cerrar el socket sin desvincular (la sesión queda en disco)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Estado del proveedor, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/cuentas/:id/desconectar', authorize('admin'), WhatsappController.desconectar);

/**
 * @openapi
 * /whatsapp/cuentas/{id}/cerrar-sesion:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Desvincular el número (purga las credenciales; el próximo inicio pide QR)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Estado del proveedor, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/cuentas/:id/cerrar-sesion', authorize('admin'), WhatsappController.cerrarSesion);

/**
 * @openapi
 * /whatsapp/cuentas/{id}/estado:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Estado del socket (lo poletea el panel mientras muestra el QR)
 *     description: El QR vive SÓLO en memoria del proceso; no se persiste.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Estado del proveedor, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/cuentas/:id/estado', authorize('admin'), WhatsappController.estado);

export default router;
