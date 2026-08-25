import { Router } from 'express';
import { FinanciacionController } from '../controllers/FinanciacionController';
import { ComprobanteController } from '../controllers/ComprobanteController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createFinanciacionSchema, simularFinanciacionSchema, refinanciarFinanciacionSchema, updateFinanciacionSchema, pagarCuotaSchema } from '../validation/financiacion.schema';

/**
 * CRITERIO DE PERMISOS: quien HACE el trabajo lo REGISTRA; ANULAR es del admin,
 * porque dar de baja un contrato o una cobranza es la operación con la que se
 * tapa un desvío. `super_admin` tiene bypass en authorize(), no se nombra.
 *
 * Toda ruta que MUTA lleva `authorize(...)`: `router.use(authenticate)` exige
 * sesión, no rol, y los controllers no miran roles. Sin esto el perfil `lectura`
 * instrumenta y anula contratos por curl.
 *
 * En financiación el reparto NO es "sólo el cobrador": la financiación propia se
 * instrumenta AL CERRAR LA VENTA, y el que cierra es el vendedor (PRODUCT.md).
 * Por eso alta, edición, refinanciación y cobro de cuota van a los tres roles
 * operativos (admin, vendedor, cobrador) y sólo la baja del contrato queda en
 * admin. Sacarle financiación al vendedor rompería flujos que hoy andan: el
 * código ya le concedía refinanciar y pagar cuota antes de este cambio.
 */

const router = Router();

/**
 * @openapi
 * /financiaciones:
 *   get:
 *     tags: [Financiación]
 *     summary: Listar financiaciones
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
router.get('/', FinanciacionController.getAll);

/**
 * @openapi
 * /financiaciones/{id}:
 *   get:
 *     tags: [Financiación]
 *     summary: Obtener financiación por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Financiación encontrada, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', FinanciacionController.getById);

/**
 * @openapi
 * /financiaciones:
 *   post:
 *     tags: [Financiación]
 *     summary: Crear financiación (genera plan de cuotas)
 *     description: Requiere rol admin, vendedor o cobrador.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ventaId, monto, cantidadCuotas]
 *             properties:
 *               ventaId: { type: integer }
 *               financieraId: { type: integer, nullable: true }
 *               monto: { type: number }
 *               cantidadCuotas: { type: integer }
 *               tasa: { type: number }
 *               fechaInicio: { type: string, format: date }
 *     responses:
 *       201: { description: Financiación creada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
/**
 * @openapi
 * /financiaciones/simular:
 *   post:
 *     tags: [Financiación]
 *     summary: Simular un plan de cuotas (sin persistir)
 *     description: Calcula el plan de cuotas para mostrarle al cliente antes de instrumentar el crédito. Usa la misma amortización que el alta real. No crea nada.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [montoFinanciado, cuotas]
 *             properties:
 *               montoFinanciado: { type: number }
 *               cuotas: { type: integer }
 *               tasaMensual: { type: number }
 *               moneda: { type: string, enum: [ARS, USD] }
 *               fechaInicio: { type: string, format: date }
 *               diaVencimiento: { type: integer, minimum: 1, maximum: 31 }
 *     responses:
 *       200: { description: Plan simulado (resumen + cuotas), content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
// SIN authorize A PROPÓSITO — no es un olvido.
// `FinanciacionController.simular` no toca Prisma ni audita: sólo llama a
// `planDeCuotas`, que pese a vivir en el repositorio es una función pura
// (aritmética de sistema francés y reparto de centavos) y devuelve el JSON. No
// persiste nada, así que alcanza con estar autenticado: mostrarle el plan al
// cliente en el mostrador es parte de atenderlo, y hasta `lectura` puede hacerlo
// sin dejar rastro en la base. El único recurso que consume es CPU, y el largo
// del loop lo acota el tope de `cuotas` del schema Zod.
// Si algún día simular llegara a guardar algo (un presupuesto, un log), esta
// ruta pasa a ser mutante y necesita authorize('admin','vendedor','cobrador').
router.post('/simular', validateBody(simularFinanciacionSchema), FinanciacionController.simular);

// El vendedor entra: la financiación propia se instrumenta al cerrar la venta.
router.post('/', authorize('admin', 'vendedor', 'cobrador'), validateBody(createFinanciacionSchema), FinanciacionController.create);

/**
 * @openapi
 * /financiaciones/{id}/refinanciar:
 *   post:
 *     tags: [Financiaciones]
 *     summary: Refinancia el saldo pendiente de un contrato en uno nuevo
 *     description: >
 *       Calcula el saldo impago del contrato, crea una financiación nueva por ese
 *       importe (heredando la moneda) y deja el original en estado 'refinanciada'
 *       con sus cuotas impagas en 'refinanciada' y saldo 0. El monto NO se recibe:
 *       se deriva del saldo real de las cuotas.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cuotas]
 *             properties:
 *               cuotas: { type: integer, description: En cuántas cuotas se refinancia }
 *               diaVencimiento: { type: integer, description: Por defecto, el del contrato original }
 *               tasaMensual: { type: number, nullable: true, description: Si se envía, la cuota se calcula por sistema francés }
 *               fechaInicio: { type: string, format: date }
 *               cobradorId: { type: integer, nullable: true }
 *               observaciones: { type: string }
 *     responses:
 *       201: { description: Contrato nuevo creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { description: El contrato no es refinanciable (estado inválido, ya refinanciado o sin saldo) }
 */
// ATENCIÓN, ESTA RUTA NO ESTABA ABIERTA: antes de la tanda de endurecimiento ya
// era authorize('admin','vendedor'), o sea que a 'cobrador' se lo ENSANCHÓ, no se
// lo cerró. Es la única línea de esa tanda donde un authorize preexistente se
// abrió, y queda escrito acá para que se pueda revertir a conciencia.
//
// Por qué se sostiene: PRODUCT.md le asigna al cobrador "la financiación propia,
// las cuotas y las cobranzas", y refinanciar un saldo impago es exactamente eso —
// es la herramienta con la que se cierra una visita a un moroso. Además el monto
// no lo declara él (RefinanciarFinanciacion lo deriva del saldo impago real), el
// estado de origen está acotado a activa/en_mora, y queda una acción de auditoría
// propia ('refinanciar'). El "segundo par de ojos" que se perdería no existía: el
// mismo rol ya podía dar cuotas por pagadas (PATCH /cuotas/:cuotaId/pagar), que es
// la palanca más peligrosa de las dos.
//
// (El argumento de "el front le muestra el botón y come un 403" NO es prueba de
// nada y por eso ya no figura: ese botón se le mostraba a TODOS los roles, lectura
// incluido. Eso era un bug del front y se arregló ahí, gateando el control.)
// Al vendedor NO se le saca: alguien se lo dio deliberadamente.
router.post('/:id/refinanciar', authorize('admin', 'cobrador', 'vendedor'), validateBody(refinanciarFinanciacionSchema), FinanciacionController.refinanciar);

/**
 * @openapi
 * /financiaciones/{id}:
 *   patch:
 *     tags: [Financiación]
 *     summary: Actualizar financiación
 *     description: Requiere rol admin, vendedor o cobrador.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado: { type: string }
 *               observaciones: { type: string }
 *     responses:
 *       200: { description: Financiación actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// OJO: este PATCH acepta estado:'cancelada' y el front lo ofrece como "Cerrar
// Contrato", en paralelo al DELETE "Anular Contrato". O sea que el criterio
// "anular es del admin" no queda garantizado por cerrar el DELETE: para que lo
// esté hay que chequear la transición a 'cancelada' dentro de UpdateFinanciacion.
// Se deja en los tres roles operativos para no romper la edición corriente del
// contrato, que es trabajo diario de vendedor y cobrador.
router.patch('/:id', authorize('admin', 'vendedor', 'cobrador'), validateBody(updateFinanciacionSchema), FinanciacionController.update);

/**
 * @openapi
 * /financiaciones/{id}:
 *   delete:
 *     tags: [Financiación]
 *     summary: Eliminar financiación (soft delete)
 *     description: Requiere rol admin. Anular un contrato de crédito es del administrador.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin'), FinanciacionController.delete);

/**
 * @openapi
 * /financiaciones/cuotas/{cuotaId}/pagar:
 *   patch:
 *     tags: [Financiación]
 *     summary: Registrar pago de cuota
 *     description: Requiere rol admin, cobrador o vendedor.
 *     parameters:
 *       - { name: cuotaId, in: path, required: true, schema: { type: integer } }
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
 *               formaPago: { type: string }
 *               observaciones: { type: string }
 *     responses:
 *       200: { description: Pago registrado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
// SE DEJA COMO ESTABA. En una concesionaria chica el vendedor cobra la cuota en
// el mostrador cuando el cobrador no está; sacarle el permiso sería una regresión
// funcional disfrazada de endurecimiento.
router.patch('/cuotas/:cuotaId/pagar', authorize('admin', 'cobrador', 'vendedor'), validateBody(pagarCuotaSchema), FinanciacionController.pagarCuota);

/**
 * @openapi
 * /financiaciones/cuotas/{cuotaId}/recibo:
 *   get:
 *     tags: [Financiación]
 *     summary: Recibo de pago de una cuota en PDF
 *     parameters:
 *       - { name: cuotaId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: PDF del recibo, content: { application/pdf: {} } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/cuotas/:cuotaId/recibo', ComprobanteController.cuotaReciboPdf);

export default router;
