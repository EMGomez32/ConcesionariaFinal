import { Router } from 'express';
import { SearchController } from '../controllers/SearchController';

const router = Router();

// El `authenticate` global (routes/index.ts) ya corrió. Cualquier rol puede
// buscar: los resultados están acotados a su tenant (RLS) y sólo exponen campos
// de identificación (nada sensible).

/**
 * @openapi
 * /search:
 *   get:
 *     tags: [Búsqueda]
 *     summary: Búsqueda global (command palette)
 *     description: Busca vehículos, clientes y proveedores por texto. Devuelve hasta 6 de cada uno.
 *     parameters:
 *       - { in: query, name: q, schema: { type: string }, description: "Texto a buscar (mín. 2 caracteres)" }
 *     responses:
 *       200:
 *         description: Resultados agrupados por entidad
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vehiculos: { type: array, items: { type: object } }
 *                 clientes: { type: array, items: { type: object } }
 *                 proveedores: { type: array, items: { type: object } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', SearchController.global);

export default router;
