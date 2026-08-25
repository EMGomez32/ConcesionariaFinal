import { Router } from 'express';
import { VehiculoMovimientoController } from '../controllers/VehiculoMovimientoController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createMovimientoSchema, marcarRetornoSchema } from '../validation/vehiculo-movimiento.schema';

/**
 * CRITERIO DE PERMISOS: quien HACE el trabajo lo REGISTRA; ANULAR es del admin,
 * porque borrar el rastro de una operación es con lo que se tapa un desvío. Acá
 * no hay ninguna baja: las dos rutas registran hechos físicos (la unidad se mueve,
 * la unidad vuelve), así que ambas son de los roles operativos.
 * `super_admin` tiene bypass en authorize(), no se nombra.
 *
 * Toda ruta que MUTA lleva `authorize(...)`: `router.use(authenticate)` exige
 * sesión, no rol, y los controllers no miran roles.
 *
 * La lista de POST / se alinea con POST /vehiculos/:id/transferir (admin,
 * vendedor), que crea el mismo tipo de fila por otra vía. Nota: reservas y ventas
 * también generan movimientos desde sus propios use-cases sin pasar por acá.
 */

const router = Router();

/**
 * @openapi
 * /vehiculo-movimientos:
 *   get:
 *     tags: [Vehículos]
 *     summary: Listar movimientos de vehículos
 *     description: Historial de cambios de sucursal, reservas, ventas, etc.
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
router.get('/', VehiculoMovimientoController.getAll);

/**
 * @openapi
 * /vehiculo-movimientos:
 *   post:
 *     tags: [Vehículos]
 *     summary: Crear movimiento de vehículo
 *     description: Requiere rol admin o vendedor.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehiculoId, tipo]
 *             properties:
 *               vehiculoId: { type: integer }
 *               tipo: { type: string }
 *               sucursalOrigenId: { type: integer, nullable: true }
 *               sucursalDestinoId: { type: integer, nullable: true }
 *               motivo: { type: string }
 *     responses:
 *       201: { description: Movimiento creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/', authorize('admin', 'vendedor'), validateBody(createMovimientoSchema), VehiculoMovimientoController.create);

/**
 * @openapi
 * /vehiculo-movimientos/{id}/retorno:
 *   patch:
 *     tags: [Vehículos]
 *     summary: Marcar el retorno de una preparación
 *     description: >
 *       Cierra el ciclo de un envío a preparación (mecánico, lavadero, etc.)
 *       registrando su vuelta. Requiere rol admin, vendedor o postventa.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Retorno registrado }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// `postventa` va incluido a propósito: recibir la unidad que vuelve del taller es
// su trabajo, y hoy llega a esta ruta. Cerrarla a admin+vendedor sería romper un
// flujo real para "endurecer" algo que ni siquiera es una baja.
router.patch('/:id/retorno', authorize('admin', 'vendedor', 'postventa'), validateBody(marcarRetornoSchema), VehiculoMovimientoController.marcarRetorno);

export default router;
