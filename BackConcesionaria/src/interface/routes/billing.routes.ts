import { Router } from 'express';
import { BillingController } from '../controllers/BillingController';

const router = Router();

// Planes
/**
 * @openapi
 * /billing/planes:
 *   get:
 *     tags: [Billing]
 *     summary: Listar planes SaaS
 *     responses:
 *       200: { description: Listado de planes, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/planes', BillingController.getPlanes);

/**
 * @openapi
 * /billing/planes:
 *   post:
 *     tags: [Billing]
 *     summary: Crear plan SaaS
 *     description: super_admin only.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, precio]
 *             properties:
 *               nombre: { type: string }
 *               descripcion: { type: string }
 *               precio: { type: number }
 *               periodicidad: { type: string }
 *               features: { type: object }
 *     responses:
 *       201: { description: Plan creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/planes', BillingController.createPlan);

/**
 * @openapi
 * /billing/planes/{id}:
 *   patch:
 *     tags: [Billing]
 *     summary: Actualizar plan SaaS
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
 *               descripcion: { type: string }
 *               precio: { type: number }
 *               periodicidad: { type: string }
 *               features: { type: object }
 *               activo: { type: boolean }
 *     responses:
 *       200: { description: Plan actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/planes/:id', BillingController.updatePlan);

// Suscripciones
/**
 * @openapi
 * /billing/subscription:
 *   get:
 *     tags: [Billing]
 *     summary: Obtener suscripción del tenant actual
 *     responses:
 *       200: { description: Suscripción, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/subscription', BillingController.getMySubscription);

/**
 * @openapi
 * /billing/concesionarias/{id}/subscription:
 *   get:
 *     tags: [Billing]
 *     summary: Obtener suscripción por concesionariaId
 *     description: super_admin only.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Suscripción, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/concesionarias/:id/subscription', BillingController.getSubscriptionByConcesionariaId);

/**
 * @openapi
 * /billing/concesionarias/{id}/subscription:
 *   patch:
 *     tags: [Billing]
 *     summary: Crear o actualizar suscripción de la concesionaria
 *     description: super_admin only.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId]
 *             properties:
 *               planId: { type: integer }
 *               estado: { type: string }
 *               fechaInicio: { type: string, format: date }
 *               fechaFin: { type: string, format: date, nullable: true }
 *     responses:
 *       200: { description: Suscripción actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/concesionarias/:id/subscription', BillingController.updateSubscription);

// Invoices
/**
 * @openapi
 * /billing/invoices:
 *   get:
 *     tags: [Billing]
 *     summary: Listar facturas
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
router.get('/invoices', BillingController.getInvoices);

/**
 * @openapi
 * /billing/invoices:
 *   post:
 *     tags: [Billing]
 *     summary: Crear factura
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [concesionariaId, monto]
 *             properties:
 *               concesionariaId: { type: integer }
 *               subscriptionId: { type: integer, nullable: true }
 *               monto: { type: number }
 *               fechaEmision: { type: string, format: date }
 *               fechaVencimiento: { type: string, format: date }
 *               estado: { type: string }
 *               descripcion: { type: string }
 *     responses:
 *       201: { description: Factura creada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/invoices', BillingController.createInvoice);

/**
 * @openapi
 * /billing/invoices/{id}:
 *   get:
 *     tags: [Billing]
 *     summary: Obtener factura por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Factura encontrada, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/invoices/:id', BillingController.getInvoiceById);

/**
 * @openapi
 * /billing/invoices/{id}/payments:
 *   post:
 *     tags: [Billing]
 *     summary: Registrar pago de factura
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [monto]
 *             properties:
 *               monto: { type: number }
 *               fechaPago: { type: string, format: date-time }
 *               metodo: { type: string }
 *               referencia: { type: string }
 *     responses:
 *       200: { description: Pago registrado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.post('/invoices/:id/payments', BillingController.registrarPagoInvoice);

export default router;
