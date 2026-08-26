import { Router } from 'express';
import { PrecioMinimoController } from '../controllers/PrecioMinimoController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { crearSolicitudPrecioMinimoSchema, resolverSolicitudPrecioMinimoSchema } from '../validation/precio-minimo.schema';

const router = Router();

/**
 * Autorización del PRECIO MÍNIMO de venta.
 *
 * El dueño decidió que el piso "requiere autorización por sistema": el vendedor
 * lo pide (POST /), un admin lo resuelve (PATCH /:id/resolver) y recién ahí el
 * valor viaja (GET /vehiculo/:vehiculoId). Todo el criterio está en
 * `application/services/precioAutorizacion.ts`.
 *
 * Gating: el listado y el pedido son admin+vendedor (es el vendedor quien pide);
 * la RESOLUCIÓN es admin puro — es la única ruta del módulo que destapa el
 * número, y dejarla abierta al vendedor haría el flujo entero decorativo.
 */

/**
 * @openapi
 * /precio-minimo:
 *   get:
 *     tags: [Precio mínimo]
 *     summary: Bandeja de solicitudes (el admin ve las del tenant, el vendedor sólo las propias)
 *     parameters:
 *       - { in: query, name: estado, schema: { type: string, enum: [pendiente, autorizada, rechazada, expirada] } }
 *       - { in: query, name: vehiculoId, schema: { type: integer } }
 *     responses:
 *       200: { description: Solicitudes }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', authorize('admin', 'vendedor'), PrecioMinimoController.getAll);

/**
 * @openapi
 * /precio-minimo/vehiculo/{vehiculoId}:
 *   get:
 *     tags: [Precio mínimo]
 *     summary: Precio mínimo autorizado y vigente del usuario para esa unidad
 *     description: Responde autorizado=false cuando no hay autorización vigente. NUNCA lee Vehiculo.precioMinimo en vivo, sino el snapshot autorizado.
 *     parameters:
 *       - { name: vehiculoId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Autorización vigente o negativa explícita }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/vehiculo/:vehiculoId', authorize('admin', 'vendedor'), PrecioMinimoController.vigentePorVehiculo);

/**
 * @openapi
 * /precio-minimo:
 *   post:
 *     tags: [Precio mínimo]
 *     summary: El vendedor pide ver el piso de venta de una unidad
 *     description: Idempotente por (vehículo, solicitante) mientras haya una pendiente.
 *     responses:
 *       201: { description: Solicitud creada (o la pendiente que ya existía) }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/', authorize('admin', 'vendedor'), validateBody(crearSolicitudPrecioMinimoSchema), PrecioMinimoController.create);

/**
 * @openapi
 * /precio-minimo/{id}/resolver:
 *   patch:
 *     tags: [Precio mínimo]
 *     summary: El admin autoriza (con valor y vigencia) o rechaza
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Solicitud resuelta }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: Ya estaba resuelta }
 */
router.patch('/:id/resolver', authorize('admin'), validateBody(resolverSolicitudPrecioMinimoSchema), PrecioMinimoController.resolver);

export default router;
