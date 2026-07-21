import { Router } from 'express';
import { RolController } from '../controllers/RolController';

const router = Router();

/**
 * @openapi
 * /roles:
 *   get:
 *     tags: [Auth]
 *     summary: Listar roles disponibles
 *     description: Catálogo de roles del sistema (super_admin, admin, vendedor, etc.).
 *     responses:
 *       200:
 *         description: Listado de roles
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   nombre: { type: string }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', RolController.getAll);

export default router;
