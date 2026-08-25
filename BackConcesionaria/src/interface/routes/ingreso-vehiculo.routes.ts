import { Router } from 'express';
import { IngresoVehiculoController } from '../controllers/IngresoVehiculoController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createIngresoVehiculoSchema } from '../validation/ingreso-vehiculo.schema';

/**
 * CRITERIO DE PERMISOS: quien HACE el trabajo lo REGISTRA; ANULAR es del admin,
 * porque borrar el ingreso de una unidad (con su monto de compra) es una de las
 * operaciones con las que se tapa un desvío. `super_admin` tiene bypass en
 * authorize(), no se nombra.
 *
 * Toda ruta que MUTA lleva `authorize(...)`: `router.use(authenticate)` exige
 * sesión, no rol, y los controllers no miran roles. Sin esto el perfil `lectura`
 * anula ingresos por curl.
 *
 * Dato a tener presente: gatear el POST de acá NO controla la creación de
 * ingresos. El alta real la hace `CreateVehiculo`, que crea el IngresoVehiculo
 * dentro de su transacción; el POST de esta ruta hoy no lo llama nadie desde el
 * front. La puerta que importa es POST /vehiculos, ya en admin+vendedor — por eso
 * acá se usa la misma lista, para que las dos vías no se contradigan.
 */

const router = Router();

/**
 * @openapi
 * /vehiculo-ingresos:
 *   get:
 *     tags: [Vehículos]
 *     summary: Listar ingresos de vehículos
 *     description: Acepta filtros startDate y endDate (ISO 8601) sobre el campo `fecha`.
 *     parameters:
 *       - { $ref: '#/components/parameters/pageParam' }
 *       - { $ref: '#/components/parameters/limitParam' }
 *       - { name: startDate, in: query, schema: { type: string, format: date }, description: 'Fecha inicial (ISO)' }
 *       - { name: endDate, in: query, schema: { type: string, format: date }, description: 'Fecha final (ISO)' }
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
router.get('/', IngresoVehiculoController.getAll);

/**
 * @openapi
 * /vehiculo-ingresos/{id}:
 *   get:
 *     tags: [Vehículos]
 *     summary: Obtener ingreso por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Ingreso encontrado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', IngresoVehiculoController.getById);

/**
 * @openapi
 * /vehiculo-ingresos:
 *   post:
 *     tags: [Vehículos]
 *     summary: Registrar ingreso de vehículo
 *     description: Requiere rol admin o vendedor.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehiculoId, fecha]
 *             properties:
 *               vehiculoId: { type: integer }
 *               fecha: { type: string, format: date-time }
 *               tipo: { type: string }
 *               proveedorId: { type: integer, nullable: true }
 *               montoCompra: { type: number }
 *               observaciones: { type: string }
 *     responses:
 *       201: { description: Ingreso creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/', authorize('admin', 'vendedor'), validateBody(createIngresoVehiculoSchema), IngresoVehiculoController.create);

/**
 * @openapi
 * /vehiculo-ingresos/{id}:
 *   delete:
 *     tags: [Vehículos]
 *     summary: Eliminar ingreso (soft delete)
 *     description: Requiere rol admin. Borra el ingreso con su monto de compra.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// El front muestra este ícono ("Anular Ingreso") a todos los roles: hay que
// ocultarlo para no-admin, o el vendedor come un 403 sin explicación.
router.delete('/:id', authorize('admin'), IngresoVehiculoController.delete);

export default router;
