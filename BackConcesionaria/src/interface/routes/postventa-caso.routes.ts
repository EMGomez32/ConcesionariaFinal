import { Router } from 'express';
import { PostventaCasoController } from '../controllers/PostventaCasoController';
import { authorize } from '../middlewares/authorize.middleware';
import * as casoValidation from '../../modules/postventa-casos/caso.validation';
import { validate } from '../../middlewares/validate';

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
router.post('/', authorize('admin', 'postventa', 'vendedor'), casoValidation.createCaso, validate, PostventaCasoController.create);

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
router.patch('/:id', authorize('admin', 'postventa', 'vendedor'), casoValidation.updateCaso, validate, PostventaCasoController.update);

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
