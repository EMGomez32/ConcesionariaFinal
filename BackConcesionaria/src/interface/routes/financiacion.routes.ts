import { Router } from 'express';
import { FinanciacionController } from '../controllers/FinanciacionController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createFinanciacionSchema, refinanciarFinanciacionSchema, updateFinanciacionSchema, pagarCuotaSchema } from '../validation/financiacion.schema';

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
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/', validateBody(createFinanciacionSchema), FinanciacionController.create);

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
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { description: El contrato no es refinanciable (estado inválido, ya refinanciado o sin saldo) }
 */
router.post('/:id/refinanciar', authorize('admin', 'vendedor'), validateBody(refinanciarFinanciacionSchema), FinanciacionController.refinanciar);

/**
 * @openapi
 * /financiaciones/{id}:
 *   patch:
 *     tags: [Financiación]
 *     summary: Actualizar financiación
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
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', validateBody(updateFinanciacionSchema), FinanciacionController.update);

/**
 * @openapi
 * /financiaciones/{id}:
 *   delete:
 *     tags: [Financiación]
 *     summary: Eliminar financiación (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', FinanciacionController.delete);

/**
 * @openapi
 * /financiaciones/cuotas/{cuotaId}/pagar:
 *   patch:
 *     tags: [Financiación]
 *     summary: Registrar pago de cuota
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
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.patch('/cuotas/:cuotaId/pagar', validateBody(pagarCuotaSchema), FinanciacionController.pagarCuota);

export default router;
