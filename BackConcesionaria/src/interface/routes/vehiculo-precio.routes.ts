import { Router } from 'express';
import { VehiculoPrecioHistorialController } from '../controllers/VehiculoPrecioHistorialController';
import { authorize } from '../middlewares/authorize.middleware';

const router = Router();

/**
 * @openapi
 * /vehiculo-precios/vehiculo/{vehiculoId}:
 *   get:
 *     tags: [Inventario]
 *     summary: Historial de precios de lista de un vehículo
 *     parameters:
 *       - { name: vehiculoId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Historial de precios (más reciente primero) }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/vehiculo/:vehiculoId', authorize('admin', 'vendedor'), VehiculoPrecioHistorialController.getByVehiculo);

export default router;
