import { Router } from 'express';
import { PostventaCasoController } from '../controllers/PostventaCasoController';
import { ComprobanteController } from '../controllers/ComprobanteController';
import { authorize } from '../middlewares/authorize.middleware';

import { validateBody } from '../middlewares/validate.middleware';
import { createCasoSchema, updateCasoSchema } from '../validation/postventa-caso.schema';
const router = Router();

/**
 * @openapi
 * /postventa-casos:
 *   get:
 *     tags: [Postventa]
 *     summary: Listar casos de postventa
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
router.get('/', PostventaCasoController.getAll);

/**
 * @openapi
 * /postventa-casos/export/csv:
 *   get:
 *     tags: [Postventa]
 *     summary: Exportar la cartera de casos a CSV (mismos filtros del listado)
 *     description: admin/postventa/vendedor. CSV con BOM (Excel) y protección anti-inyección de fórmulas. Tope 5000.
 *     parameters:
 *       - { in: query, name: estado, schema: { type: string } }
 *       - { in: query, name: clienteId, schema: { type: integer } }
 *       - { in: query, name: vehiculoId, schema: { type: integer } }
 *     responses:
 *       200: { description: CSV de casos, content: { text/csv: {} } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/export/csv', authorize('admin', 'postventa', 'vendedor'), PostventaCasoController.exportCsv);

/**
 * @openapi
 * /postventa-casos/{id}:
 *   get:
 *     tags: [Postventa]
 *     summary: Obtener caso de postventa por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Caso encontrado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', PostventaCasoController.getById);

/**
 * @openapi
 * /postventa-casos/{id}/total:
 *   get:
 *     tags: [Postventa]
 *     summary: Total de items del caso
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Total y conteo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 casoId: { type: integer }
 *                 total: { type: number }
 *                 count: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/total', PostventaCasoController.total);

/**
 * @openapi
 * /postventa-casos/{id}/orden:
 *   get:
 *     tags: [Postventa]
 *     summary: Orden de servicio del caso en PDF
 *     description: PDF con la marca de la concesionaria, datos del cliente/vehículo, el reclamo, el turno y la tabla de trabajos/repuestos con su total.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: PDF de la orden, content: { application/pdf: {} } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/orden', ComprobanteController.postventaOrdenPdf);

/**
 * @openapi
 * /postventa-casos:
 *   post:
 *     tags: [Postventa]
 *     summary: Crear caso de postventa
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clienteId, vehiculoId, sucursalId, ventaId, fechaReclamo, descripcion]
 *             properties:
 *               clienteId: { type: integer }
 *               vehiculoId: { type: integer }
 *               sucursalId: { type: integer }
 *               ventaId: { type: integer, description: Obligatorio, el reclamo siempre es sobre una unidad vendida }
 *               fechaReclamo: { type: string, format: date }
 *               descripcion: { type: string }
 *               tipo: { type: string, nullable: true }
 *     responses:
 *       201: { description: Caso creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/', authorize('admin', 'postventa', 'vendedor'), validateBody(createCasoSchema), PostventaCasoController.create);

/**
 * @openapi
 * /postventa-casos/{id}:
 *   patch:
 *     tags: [Postventa]
 *     summary: Actualizar caso de postventa
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado: { type: string, enum: [pendiente, en_curso, resuelto] }
 *               descripcion: { type: string }
 *               tipo: { type: string, nullable: true }
 *               fechaCierre: { type: string, format: date, nullable: true }
 *     responses:
 *       200: { description: Caso actualizado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.patch('/:id', authorize('admin', 'postventa', 'vendedor'), validateBody(updateCasoSchema), PostventaCasoController.update);

/**
 * @openapi
 * /postventa-casos/{id}:
 *   delete:
 *     tags: [Postventa]
 *     summary: Eliminar caso (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin'), PostventaCasoController.delete);

export default router;
