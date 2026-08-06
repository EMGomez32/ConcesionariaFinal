import { Router } from 'express';
import { ClienteController } from '../controllers/ClienteController';
import { ComprobanteController } from '../controllers/ComprobanteController';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';

import { validateBody } from '../middlewares/validate.middleware';
import { createClienteSchema, updateClienteSchema } from '../validation/cliente.schema';
const router = Router();

/**
 * @openapi
 * /clientes:
 *   get:
 *     tags: [Clientes]
 *     summary: Listar clientes
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
router.get('/', authenticate, ClienteController.getAll);

/**
 * @openapi
 * /clientes/export/csv:
 *   get:
 *     tags: [Clientes]
 *     summary: Exportar la cartera de clientes a CSV (mismos filtros del listado)
 *     description: admin/vendedor (dato personal). CSV con BOM (Excel) y protección anti-inyección de fórmulas. Tope 5000.
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: estadoLead, schema: { type: string } }
 *     responses:
 *       200: { description: CSV de clientes, content: { text/csv: {} } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/export/csv', authenticate, authorize('admin', 'vendedor'), ClienteController.exportCsv);

/**
 * @openapi
 * /clientes/{id}:
 *   get:
 *     tags: [Clientes]
 *     summary: Obtener cliente por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Cliente encontrado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', authenticate, ClienteController.getById);

/**
 * @openapi
 * /clientes/{id}/estado-cuenta/pdf:
 *   get:
 *     tags: [Clientes]
 *     summary: Estado de cuenta del cliente en PDF
 *     description: admin/vendedor. Cuenta corriente del cliente (plan de cuotas y saldos) con la marca de la concesionaria.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: PDF del estado de cuenta, content: { application/pdf: {} } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/estado-cuenta/pdf', authenticate, authorize('admin', 'vendedor'), ComprobanteController.estadoCuentaPdf);

/**
 * @openapi
 * /clientes:
 *   post:
 *     tags: [Clientes]
 *     summary: Crear cliente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string }
 *               apellido: { type: string }
 *               dni: { type: string }
 *               cuit: { type: string }
 *               email: { type: string, format: email }
 *               telefono: { type: string }
 *               direccion: { type: string }
 *     responses:
 *       201: { description: Cliente creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/', authenticate, authorize('admin', 'vendedor'), validateBody(createClienteSchema), ClienteController.create);

/**
 * @openapi
 * /clientes/{id}:
 *   patch:
 *     tags: [Clientes]
 *     summary: Actualizar cliente
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
 *               apellido: { type: string }
 *               dni: { type: string }
 *               cuit: { type: string }
 *               email: { type: string, format: email }
 *               telefono: { type: string }
 *               direccion: { type: string }
 *     responses:
 *       200: { description: Cliente actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', authenticate, authorize('admin', 'vendedor'), validateBody(updateClienteSchema), ClienteController.update);

/**
 * @openapi
 * /clientes/{id}:
 *   delete:
 *     tags: [Clientes]
 *     summary: Eliminar cliente (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authenticate, authorize('admin'), ClienteController.delete);

export default router;
