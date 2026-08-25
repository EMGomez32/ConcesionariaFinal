import { Router } from 'express';
import { ClienteController } from '../controllers/ClienteController';
import { ComprobanteController } from '../controllers/ComprobanteController';
import { authenticate } from '../middlewares/authenticate.middleware';
import { authorize } from '../middlewares/authorize.middleware';

import { validateBody } from '../middlewares/validate.middleware';
import { createClienteSchema, updateClienteSchema, consultaIngresoSchema, importClientesSchema } from '../validation/cliente.schema';
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
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: estadoLead, schema: { type: string, enum: [nuevo, contactado, negociando, ganado, perdido] } }
 *       - { in: query, name: origenLead, schema: { type: string, enum: [deruedas, mercadolibre, instagram, facebook, whatsapp, web, mostrador, referido, otro] } }
 *       - { in: query, name: vendedorAsignadoId, schema: { type: integer } }
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
 * /clientes/consulta:
 *   post:
 *     tags: [Clientes]
 *     summary: Ingresar una consulta de venta (lead)
 *     description: admin/vendedor. Dedupe por teléfono/email dentro del tenant, asignación round-robin de vendedor y reapertura de leads ganados/perdidos. No crea seguimiento.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [origen, nombre]
 *             properties:
 *               origen: { type: string, enum: [deruedas, mercadolibre, instagram, facebook, whatsapp, web, mostrador, referido, otro] }
 *               nombre: { type: string }
 *               telefono: { type: string }
 *               email: { type: string, format: email }
 *               texto: { type: string }
 *               vehiculoId: { type: integer }
 *               vendedorId: { type: integer }
 *     responses:
 *       201:
 *         description: Consulta ingresada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clienteId: { type: integer }
 *                 creado: { type: boolean }
 *                 reabierto: { type: boolean }
 *                 vendedorAsignadoId: { type: integer, nullable: true }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
// OJO: registrada ANTES de las rutas /:id para que Express no matchee "consulta"
// como un id.
router.post('/consulta', authenticate, authorize('admin', 'vendedor'), validateBody(consultaIngresoSchema), ClienteController.consulta);

/**
 * @openapi
 * /clientes/import:
 *   post:
 *     tags: [Clientes]
 *     summary: Import masivo de clientes (carga de cartera)
 *     description: Sólo admin. Lote de hasta 300 filas en una pasada secuencial. Validación fina POR FILA (errores con índice 0-based dentro del lote, la fila mala no aborta el resto). Dedupe por teléfono/email dentro del tenant; con actualizarExistentes sólo completa campos vacíos del existente. Sin round-robin de vendedor.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [filas, opciones]
 *             properties:
 *               filas:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 300
 *                 items:
 *                   type: object
 *                   properties:
 *                     nombre: { type: string }
 *                     telefono: { type: string }
 *                     email: { type: string }
 *                     dni: { type: string }
 *                     observaciones: { type: string }
 *                     origenLead: { type: string, enum: [deruedas, mercadolibre, instagram, facebook, whatsapp, web, mostrador, referido, otro] }
 *                     vendedorAsignadoId: { type: integer }
 *               opciones:
 *                 type: object
 *                 required: [estadoInicial, actualizarExistentes]
 *                 properties:
 *                   estadoInicial: { type: string, enum: [contactado, nuevo] }
 *                   origenDefault: { type: string }
 *                   actualizarExistentes: { type: boolean }
 *     responses:
 *       200:
 *         description: Resumen del lote procesado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 creados: { type: integer }
 *                 actualizados: { type: integer }
 *                 salteados: { type: integer }
 *                 errores:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       indice: { type: integer, description: 'Posición 0-based de la fila dentro del lote' }
 *                       motivo: { type: string }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
// OJO: también ANTES de las rutas /:id para que Express no matchee "import"
// como un id.
router.post('/import', authenticate, authorize('admin'), validateBody(importClientesSchema), ClienteController.importar);

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
