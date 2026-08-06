import { Router } from 'express';
import { VehiculoInteresController } from '../controllers/VehiculoInteresController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createVehiculoInteresSchema } from '../validation/vehiculo-interes.schema';

const router = Router();

/**
 * @openapi
 * /vehiculo-intereses/cliente/{clienteId}:
 *   get:
 *     tags: [CRM]
 *     summary: Vehículos que le interesan a un cliente
 *     parameters:
 *       - { name: clienteId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado de intereses }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/cliente/:clienteId', authorize('admin', 'vendedor'), VehiculoInteresController.getByCliente);

/**
 * @openapi
 * /vehiculo-intereses/vehiculo/{vehiculoId}:
 *   get:
 *     tags: [CRM]
 *     summary: Clientes interesados en un vehículo
 *     parameters:
 *       - { name: vehiculoId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado de interesados }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/vehiculo/:vehiculoId', authorize('admin', 'vendedor'), VehiculoInteresController.getByVehiculo);

/**
 * @openapi
 * /vehiculo-intereses:
 *   post:
 *     tags: [CRM]
 *     summary: Marcar el interés de un cliente en un vehículo
 *     description: Idempotente (si ya existe, actualiza la nota). Solo admin/vendedor.
 *     responses:
 *       201: { description: Interés registrado }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', authorize('admin', 'vendedor'), validateBody(createVehiculoInteresSchema), VehiculoInteresController.create);

/**
 * @openapi
 * /vehiculo-intereses/{id}:
 *   delete:
 *     tags: [CRM]
 *     summary: Quitar un interés
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin', 'vendedor'), VehiculoInteresController.delete);

export default router;
