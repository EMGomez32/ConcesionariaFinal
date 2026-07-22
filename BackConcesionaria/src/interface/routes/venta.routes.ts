import { Router } from 'express';
import { VentaController } from '../controllers/VentaController';
import { ComprobanteController } from '../controllers/ComprobanteController';
import { validateBody } from '../middlewares/validate.middleware';
import {
    createVentaSchema,
    updateVentaSchema,
    changeEstadoEntregaSchema,
    addPagoSchema,
    addExtraSchema,
    addCanjeSchema,
} from '../validation/venta.schema';

const router = Router();

/**
 * @openapi
 * /ventas/{id}/comprobante:
 *   get:
 *     tags: [Ventas]
 *     summary: Comprobante de venta en PDF
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: PDF del comprobante, content: { application/pdf: {} } }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/comprobante', ComprobanteController.ventaPdf);

/**
 * @openapi
 * /ventas:
 *   get:
 *     tags: [Ventas]
 *     summary: Listar ventas
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
router.get('/', VentaController.getAll);

/**
 * @openapi
 * /ventas/{id}:
 *   get:
 *     tags: [Ventas]
 *     summary: Obtener venta por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Venta encontrada, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', VentaController.getById);

/**
 * @openapi
 * /ventas:
 *   post:
 *     tags: [Ventas]
 *     summary: Crear venta
 *     description: Marca el vehículo como vendido y registra el movimiento.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehiculoId, clienteId, monto]
 *             properties:
 *               vehiculoId: { type: integer }
 *               clienteId: { type: integer }
 *               vendedorId: { type: integer, nullable: true }
 *               monto: { type: number }
 *               formaPago: { type: string }
 *               fecha: { type: string, format: date-time }
 *               observaciones: { type: string }
 *     responses:
 *       201: { description: Venta creada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.post('/', validateBody(createVentaSchema), VentaController.create);

/**
 * @openapi
 * /ventas/{id}:
 *   patch:
 *     tags: [Ventas]
 *     summary: Actualizar venta
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               monto: { type: number }
 *               formaPago: { type: string }
 *               observaciones: { type: string }
 *     responses:
 *       200: { description: Venta actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', validateBody(updateVentaSchema), VentaController.update);

/**
 * @openapi
 * /ventas/{id}/estado-entrega:
 *   patch:
 *     tags: [Ventas]
 *     summary: Cambiar estado de entrega de la venta
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [estadoEntrega]
 *             properties:
 *               estadoEntrega: { type: string }
 *     responses:
 *       200: { description: Estado actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.patch('/:id/estado-entrega', validateBody(changeEstadoEntregaSchema), VentaController.changeEstadoEntrega);

/**
 * @openapi
 * /ventas/{id}:
 *   delete:
 *     tags: [Ventas]
 *     summary: Eliminar venta (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', VentaController.delete);

// Sub-recursos: pagos
/**
 * @openapi
 * /ventas/{id}/pagos:
 *   get:
 *     tags: [Ventas]
 *     summary: Listar pagos de la venta
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado de pagos, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/:id/pagos', VentaController.listPagos);

/**
 * @openapi
 * /ventas/{id}/pagos:
 *   post:
 *     tags: [Ventas]
 *     summary: Agregar pago a la venta
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
 *               formaPago: { type: string }
 *               fecha: { type: string, format: date-time }
 *               observaciones: { type: string }
 *     responses:
 *       201: { description: Pago agregado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/pagos', validateBody(addPagoSchema), VentaController.addPago);

/**
 * @openapi
 * /ventas/{id}/pagos/{pagoId}:
 *   delete:
 *     tags: [Ventas]
 *     summary: Eliminar pago de la venta
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *       - { name: pagoId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Pago eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id/pagos/:pagoId', VentaController.removePago);

// Sub-recursos: extras
/**
 * @openapi
 * /ventas/{id}/extras:
 *   get:
 *     tags: [Ventas]
 *     summary: Listar extras de la venta
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado de extras, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/:id/extras', VentaController.listExtras);

/**
 * @openapi
 * /ventas/{id}/extras:
 *   post:
 *     tags: [Ventas]
 *     summary: Agregar extra a la venta
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [descripcion, monto]
 *             properties:
 *               descripcion: { type: string }
 *               monto: { type: number }
 *     responses:
 *       201: { description: Extra agregado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/extras', validateBody(addExtraSchema), VentaController.addExtra);

/**
 * @openapi
 * /ventas/{id}/extras/{extraId}:
 *   delete:
 *     tags: [Ventas]
 *     summary: Eliminar extra de la venta
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *       - { name: extraId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Extra eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id/extras/:extraId', VentaController.removeExtra);

// Sub-recursos: canjes
/**
 * @openapi
 * /ventas/{id}/canjes:
 *   get:
 *     tags: [Ventas]
 *     summary: Listar canjes de la venta
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado de canjes, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/:id/canjes', VentaController.listCanjes);

/**
 * @openapi
 * /ventas/{id}/canjes:
 *   post:
 *     tags: [Ventas]
 *     summary: Agregar canje a la venta
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [valorTomado]
 *             properties:
 *               vehiculoCanjeId: { type: integer, nullable: true }
 *               descripcion: { type: string }
 *               valorTomado: { type: number }
 *     responses:
 *       201: { description: Canje agregado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/canjes', validateBody(addCanjeSchema), VentaController.addCanje);

/**
 * @openapi
 * /ventas/{id}/canjes/{canjeId}:
 *   delete:
 *     tags: [Ventas]
 *     summary: Eliminar canje de la venta
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *       - { name: canjeId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Canje eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id/canjes/:canjeId', VentaController.removeCanje);

export default router;
