import { Router } from 'express';
import { BillingController } from '../controllers/BillingController';
import { authorize } from '../middlewares/authorize.middleware';

// NOTA: comentario de línea y no bloque JSDoc a propósito — swagger-jsdoc
// parsea TODO bloque /** */ de este directorio como YAML, y una lista con dos
// puntos adentro lo hace explotar al arrancar (rompe la spec entera, no sólo
// esta ruta). Los comentarios largos de estos archivos van con //.
// CRITERIO DE PERMISOS DE ESTE MÓDULO — leer antes de agregar una ruta.
//
// Billing es la facturación del SaaS: la plataforma le cobra a la concesionaria.
// Hay dos audiencias y NO son la misma:
//
//   - `super_admin` (la plataforma): define el catálogo de planes, asigna la
//     suscripción de cada concesionaria y emite las facturas. Es quien cobra.
//   - `admin` (el dueño de UNA concesionaria): mira su plan, su suscripción y sus
//     facturas, y registra que las pagó. Es quien paga.
//
// Antes esto estaba gateado en el MONTAJE con `authorize('admin')`, lo que dejaba
// a cualquier admin de cualquier tenant escribir el catálogo. Y `Plan` es un
// modelo GLOBAL (ver GLOBAL_MODELS en prisma.extension.ts): la extensión NO le
// inyecta `concesionariaId` ni lo envuelve en la transacción con `app.tenant_id`,
// así que un `plan.update({ where: { id } })` pega directo en la fila que
// comparten TODOS los tenants. Un admin podía dejar el precio del SaaS en 1 para
// todo el mundo. Por eso el gating pasó a ser POR RUTA y las tres rutas que el
// @openapi ya documentaba como "super_admin only" ahora lo exigen de verdad.
//
// OJO al agregar una ruta: este router ya NO está gateado en el montaje, así que
// toda ruta necesita su `authorize(...)` propio — incluidas las lecturas, porque
// lo que se lee acá es plata del contrato con el cliente, no del salón.

const router = Router();

// Planes
/**
 * @openapi
 * /billing/planes:
 *   get:
 *     tags: [Billing]
 *     summary: Listar planes SaaS
 *     description: admin (el dueño mira el catálogo de su plan) y super_admin.
 *     responses:
 *       200: { description: Listado de planes, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/planes', authorize('admin'), BillingController.getPlanes);

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
router.post('/planes', authorize('super_admin'), BillingController.createPlan);

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
router.patch('/planes/:id', authorize('super_admin'), BillingController.updatePlan);

// Suscripciones
/**
 * @openapi
 * /billing/subscription:
 *   get:
 *     tags: [Billing]
 *     summary: Obtener suscripción del tenant actual
 *     description: admin (su propia suscripción) y super_admin.
 *     responses:
 *       200: { description: Suscripción, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/subscription', authorize('admin'), BillingController.getMySubscription);

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
router.get('/concesionarias/:id/subscription', authorize('super_admin'), BillingController.getSubscriptionByConcesionariaId);

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
router.patch('/concesionarias/:id/subscription', authorize('super_admin'), BillingController.updateSubscription);

// Invoices
/**
 * @openapi
 * /billing/invoices:
 *   get:
 *     tags: [Billing]
 *     summary: Listar facturas
 *     description: admin (las facturas de SU concesionaria) y super_admin.
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
router.get('/invoices', authorize('admin'), BillingController.getInvoices);

/**
 * @openapi
 * /billing/invoices:
 *   post:
 *     tags: [Billing]
 *     summary: Crear factura
 *     description: >
 *       super_admin only. La plataforma le emite la factura a la concesionaria;
 *       que el propio tenant se emita facturas de SaaS no tiene sentido de negocio.
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
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/invoices', authorize('super_admin'), BillingController.createInvoice);

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
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/invoices/:id', authorize('admin'), BillingController.getInvoiceById);

/**
 * @openapi
 * /billing/invoices/{id}/payments:
 *   post:
 *     tags: [Billing]
 *     summary: Registrar pago de factura
 *     description: >
 *       admin (paga las facturas de SU concesionaria) y super_admin. `status` sólo
 *       lo puede fijar super_admin: un admin registra el pago en 'pending' y la
 *       plataforma lo confirma, para que el tenant no se dé por pagado solo.
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
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.post('/invoices/:id/payments', authorize('admin'), BillingController.registrarPagoInvoice);

export default router;
