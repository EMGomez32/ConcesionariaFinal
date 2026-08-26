import { Router } from 'express';
import { ProveedorController } from '../controllers/ProveedorController';
import { authorize } from '../middlewares/authorize.middleware';

import { validateBody } from '../middlewares/validate.middleware';
import { createProveedorSchema, updateProveedorSchema } from '../validation/proveedor.schema';
const router = Router();

/**
 * @openapi
 * /proveedores:
 *   get:
 *     tags: [Proveedores]
 *     summary: Listar proveedores
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

/*
 * Criterio de aceptación 7 + "el vendedor NO VE: … proveedor".
 *
 * Se separan las dos cosas que antes eran una sola ruta abierta:
 *   - EL PADRÓN (`GET /`) es una agenda operativa: el vendedor la necesita para
 *     mandar una unidad al taller (`POST /vehiculo-movimientos` es
 *     admin+vendedor). Queda accesible para los roles que operan, no para todos
 *     los autenticados.
 *   - LA FICHA (`GET /:id`) es la relación comercial: trae `vehiculosCompra` (qué
 *     unidades vinieron de ese proveedor), `gastosVehiculo[].monto` y
 *     `postventaItems[].monto`. Eso es la cadena de compra y su costo, y se cierra
 *     al vendedor. Los montos, además, se recortan por rol en el controller.
 *
 * Esto REVIERTE la decisión que estaba escrita en `Vehiculo.ts` ("la lista de
 * proveedores la ve todo el equipo"): chocaba de frente con la especificación del
 * módulo, y entre las dos manda la especificación.
 */
router.get('/', authorize('admin', 'vendedor', 'postventa'), ProveedorController.getAll);

/**
 * @openapi
 * /proveedores/{id}:
 *   get:
 *     tags: [Proveedores]
 *     summary: Obtener proveedor por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Proveedor encontrado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', authorize('admin', 'postventa'), ProveedorController.getById);

/**
 * @openapi
 * /proveedores:
 *   post:
 *     tags: [Proveedores]
 *     summary: Crear proveedor
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string }
 *               cuit: { type: string }
 *               email: { type: string, format: email }
 *               telefono: { type: string }
 *               direccion: { type: string }
 *     responses:
 *       201: { description: Proveedor creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/', authorize('admin', 'vendedor'), validateBody(createProveedorSchema), ProveedorController.create);

/**
 * @openapi
 * /proveedores/{id}:
 *   patch:
 *     tags: [Proveedores]
 *     summary: Actualizar proveedor
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
 *               cuit: { type: string }
 *               email: { type: string, format: email }
 *               telefono: { type: string }
 *               direccion: { type: string }
 *     responses:
 *       200: { description: Proveedor actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', authorize('admin', 'vendedor'), validateBody(updateProveedorSchema), ProveedorController.update);

/**
 * @openapi
 * /proveedores/{id}:
 *   delete:
 *     tags: [Proveedores]
 *     summary: Eliminar proveedor (soft delete con guarda)
 *     description: Si el proveedor tiene gastos asociados, la operación falla con 409.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.delete('/:id', authorize('admin'), ProveedorController.delete);

export default router;
