import { Router } from 'express';
import { VentaController } from '../controllers/VentaController';
import { ComprobanteController } from '../controllers/ComprobanteController';
import { FacturaController } from '../controllers/FacturaController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import {
    createVentaSchema,
    updateVentaSchema,
    changeEstadoEntregaSchema,
    addPagoSchema,
    addExtraSchema,
    addCanjeSchema,
} from '../validation/venta.schema';

/**
 * CRITERIO DE PERMISOS (vale para todo el módulo de operaciones):
 *
 * Quien HACE el trabajo puede REGISTRARLO; ANULAR es del administrador.
 * El motivo no es jerárquico sino de control interno: borrar una venta, un pago
 * o una seña es la operación con la que se tapa un desvío de plata. Por eso el
 * alta la puede hacer el rol operativo (el vendedor cierra, el cobrador cobra)
 * pero la baja queda en `admin`, que es a quien el dueño le pide cuentas.
 *
 * `authorize()` evalúa OR entre los roles y `super_admin` tiene bypass explícito
 * (ver authorize.middleware.ts), así que NUNCA hace falta nombrarlo acá.
 *
 * IMPORTANTE: toda ruta que MUTA tiene que llevar `authorize(...)`. Sin él, el
 * perfil `lectura` —que el producto vende como "consulta sin editar"— puede
 * crear y anular por URL o por curl: `router.use(authenticate)` sólo exige
 * sesión, no rol, y los controllers no chequean roles.
 */

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

// ── Facturación electrónica AFIP ─────────────────────────────────────────────
/**
 * @openapi
 * /ventas/{id}/factura:
 *   post:
 *     tags: [Ventas]
 *     summary: Emitir factura electrónica AFIP de la venta (obtiene el CAE)
 *     description: >
 *       Determina el tipo (A si el cliente es Responsable Inscripto, B si es
 *       consumidor final), descompone neto + IVA, numera el comprobante y solicita
 *       el CAE. En Corte 1 el CAE es simulado (modo mock). Idempotente por venta:
 *       si ya se facturó devuelve 409. Requiere rol admin o vendedor.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       201: { description: Comprobante emitido, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { description: Faltan datos fiscales del emisor o del receptor }
 */
// Emitir consume un número de la secuencia fiscal (numeración gapless con lock
// por punto de venta + tipo) y NO se puede deshacer desde el sistema: se parece
// más a "anular" que a "registrar", así que hay argumento para dejarla en admin.
// Se queda en admin+vendedor por una razón concreta del front: el ícono de la
// grilla (VentasPage.handleFactura) hace emitir-y-después-descargar en un solo
// click y corta con `return` ante cualquier error que no sea COMPROBANTE_YA_EMITIDO.
// Un 403 acá le rompería al vendedor la DESCARGA de una factura ya emitida, que
// sí le corresponde (GET /:id/factura/pdf es de lectura). Para cerrarla a admin
// hay que partir antes ese botón en dos (emitir / descargar).
router.post('/:id/factura', authorize('admin', 'vendedor'), FacturaController.emitir);

/**
 * @openapi
 * /ventas/{id}/factura:
 *   get:
 *     tags: [Ventas]
 *     summary: Comprobante fiscal AFIP de la venta
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Comprobante, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/factura', FacturaController.getByVenta);

/**
 * @openapi
 * /ventas/{id}/factura/pdf:
 *   get:
 *     tags: [Ventas]
 *     summary: Factura electrónica AFIP en PDF (con CAE y QR)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: PDF de la factura, content: { application/pdf: {} } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/factura/pdf', FacturaController.pdf);

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
 *     description: Marca el vehículo como vendido y registra el movimiento. Requiere rol admin o vendedor.
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
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
// El vendedor es el que cierra la venta (PRODUCT.md). Ojo: CreateVenta también
// pasa la Reserva a 'convertida_en_venta', o sea que quien llega acá muta la
// reserva sin pasar por PATCH /reservas/:id — coherente, es el mismo rol.
router.post('/', authorize('admin', 'vendedor'), validateBody(createVentaSchema), VentaController.create);

/**
 * @openapi
 * /ventas/{id}:
 *   patch:
 *     tags: [Ventas]
 *     summary: Actualizar venta
 *     description: Requiere rol admin o vendedor.
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
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', authorize('admin', 'vendedor'), validateBody(updateVentaSchema), VentaController.update);

/**
 * @openapi
 * /ventas/{id}/estado-entrega:
 *   patch:
 *     tags: [Ventas]
 *     summary: Cambiar estado de entrega de la venta
 *     description: Requiere rol admin, vendedor o postventa.
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
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
// `postventa` va incluido a propósito: marcar la unidad como entregada es
// literalmente su trabajo (la unidad vuelve de preparación y se entrega), y hoy
// llega a esta ruta. Dejarlo afuera cerraría un flujo real para "endurecer" algo
// que no es una anulación. Misma lógica en PATCH /vehiculo-movimientos/:id/retorno.
//
// PERO el authorize acá es de grano grueso a la fuerza: una sola ruta gobierna
// TODA la máquina de estados, y uno de los destinos posibles es `cancelada`, que
// el front rotula "Anular Operación" y es terminal. Autorizar `entregada` regalaba
// `cancelada`. El destino se acota por rol adentro (VentaController:
// ESTADOS_ENTREGA_DE_ADMIN), que es donde se puede leer el body.
router.patch('/:id/estado-entrega', authorize('admin', 'vendedor', 'postventa'), validateBody(changeEstadoEntregaSchema), VentaController.changeEstadoEntrega);

/**
 * @openapi
 * /ventas/{id}:
 *   delete:
 *     tags: [Ventas]
 *     summary: Eliminar venta (soft delete)
 *     description: Requiere rol admin. Anular una venta es la operación con la que se tapa un desvío.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// Sólo admin: además de revertir el estado del vehículo, DeleteVenta dispara la
// sincronización con Mercado Libre fuera del request (republica la unidad), así
// que el alcance real de esta ruta excede a la fila borrada.
router.delete('/:id', authorize('admin'), VentaController.delete);

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
 *     description: Requiere rol admin, vendedor o cobrador.
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
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// El cobrador entra acá porque cobrar es su trabajo; el vendedor porque toma la
// entrega en el mostrador al cerrar.
router.post('/:id/pagos', authorize('admin', 'vendedor', 'cobrador'), validateBody(addPagoSchema), VentaController.addPago);

/**
 * @openapi
 * /ventas/{id}/pagos/{pagoId}:
 *   delete:
 *     tags: [Ventas]
 *     summary: Eliminar pago de la venta
 *     description: Requiere rol admin. Borrar un cobro ya registrado es la operación sensible del módulo.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *       - { name: pagoId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Pago eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// Es el único DELETE de sub-recurso que se cierra a admin: borrar un pago hace
// desaparecer plata cobrada. Extras y canjes quedan en admin+vendedor porque un
// extra mal tipeado es un error de carga, no un desvío (ver más abajo).
// PENDIENTE FRONT: VentaSubResources muestra el Trash2 de pagos a todos; hay que
// ocultarlo para no-admin o el vendedor come un 403 sin pista visual.
router.delete('/:id/pagos/:pagoId', authorize('admin'), VentaController.removePago);

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
 *     description: Requiere rol admin o vendedor.
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
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/extras', authorize('admin', 'vendedor'), validateBody(addExtraSchema), VentaController.addExtra);

/**
 * @openapi
 * /ventas/{id}/extras/{extraId}:
 *   delete:
 *     tags: [Ventas]
 *     summary: Eliminar extra de la venta
 *     description: Requiere rol admin o vendedor.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *       - { name: extraId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Extra eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// DESVÍO DELIBERADO del "anular es del admin": el alta y la baja del extra viven
// en el mismo acordeón del front, con el Trash2 al lado del "+". Cerrarlo a admin
// le rompe al vendedor la corrección de su propio error de tipeo, y un extra mal
// cargado no es plata que se fuga: es un renglón que hay que arreglar.
//
// El desvío sólo se sostiene porque el borrado está ATADO A SU VENTA: el
// repositorio hace `deleteMany({ where: { id: extraId, ventaId } })`. Antes era
// `delete({ where: { id: extraId } })` y el :id de la venta era decorativo, así
// que con el extraId de una venta ajena (que `GET /ventas/:id` devuelve sin
// gating) el vendedor le bajaba el facturado a la venta de otro. Si alguien
// vuelve a ignorar el ventaId en el repositorio, este authorize tiene que
// cerrarse a admin en la misma pasada.
router.delete('/:id/extras/:extraId', authorize('admin', 'vendedor'), VentaController.removeExtra);

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
 *     description: Requiere rol admin o vendedor.
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
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/canjes', authorize('admin', 'vendedor'), validateBody(addCanjeSchema), VentaController.addCanje);

/**
 * @openapi
 * /ventas/{id}/canjes/{canjeId}:
 *   delete:
 *     tags: [Ventas]
 *     summary: Eliminar canje de la venta
 *     description: Requiere rol admin.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *       - { name: canjeId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Canje eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// NO sigue el desvío del DELETE de extras, aunque el acordeón sea el mismo. El
// canje es el renglón que BAJA el total de la venta: un usado tomado a $8.000.000
// se descuenta de lo que el cliente debe. Borrarlo y volver a cargarlo con otro
// valor es la única forma que le queda al vendedor de mover el neto de una
// operación cerrada (updateVentaSchema no acepta `precioVenta`), y eso es
// exactamente lo que "anular es del admin" existe para frenar. El argumento del
// error de tipeo aplica a un extra de $30.000, no a un auto.
router.delete('/:id/canjes/:canjeId', authorize('admin'), VentaController.removeCanje);

export default router;
