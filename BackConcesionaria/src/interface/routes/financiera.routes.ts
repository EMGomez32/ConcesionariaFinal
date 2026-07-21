import { Router } from 'express';
import { FinancieraController } from '../controllers/FinancieraController';
import { authorize } from '../middlewares/authorize.middleware';
import * as financieraValidation from '../../modules/financieras/financiera.validation';
import { validate } from '../../middlewares/validate';

const router = Router();

/**
 * @openapi
 * /financieras:
 *   get:
 *     tags: [Financiación]
 *     summary: Listar financieras
 *     responses:
 *       200: { description: Listado, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', FinancieraController.getAll);

/**
 * @openapi
 * /financieras/{id}:
 *   get:
 *     tags: [Financiación]
 *     summary: Obtener financiera por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Financiera encontrada, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', FinancieraController.getById);

/**
 * @openapi
 * /financieras:
 *   post:
 *     tags: [Financiación]
 *     summary: Crear financiera
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
 *               telefono: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       201: { description: Financiera creada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/', authorize('admin', 'vendedor'), financieraValidation.createFinanciera, validate, FinancieraController.create);

/**
 * @openapi
 * /financieras/{id}:
 *   patch:
 *     tags: [Financiación]
 *     summary: Actualizar financiera
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
 *               telefono: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Financiera actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id', authorize('admin', 'vendedor'), financieraValidation.updateFinanciera, validate, FinancieraController.update);

/**
 * @openapi
 * /financieras/{id}:
 *   delete:
 *     tags: [Financiación]
 *     summary: Eliminar financiera (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin'), FinancieraController.delete);

export default router;
