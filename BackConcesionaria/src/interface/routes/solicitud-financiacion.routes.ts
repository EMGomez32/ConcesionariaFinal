import { Router } from 'express';
import { SolicitudFinanciacionController } from '../controllers/SolicitudFinanciacionController';
import { uploadSingle } from '../middlewares/upload.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import * as solicitudValidation from '../../modules/financiacion-solicitudes/solicitud.validation';
import { validate } from '../../middlewares/validate';

const router = Router();

/**
 * @openapi
 * /financiacion-solicitudes:
 *   get:
 *     tags: [Financiación]
 *     summary: Listar solicitudes de financiación
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
router.get('/', SolicitudFinanciacionController.getAll);

/**
 * @openapi
 * /financiacion-solicitudes/{id}:
 *   get:
 *     tags: [Financiación]
 *     summary: Obtener solicitud por id
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Solicitud encontrada, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', SolicitudFinanciacionController.getById);

/**
 * @openapi
 * /financiacion-solicitudes:
 *   post:
 *     tags: [Financiación]
 *     summary: Crear solicitud de financiación
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clienteId]
 *             properties:
 *               clienteId: { type: integer }
 *               vehiculoId: { type: integer, nullable: true }
 *               financieraId: { type: integer, nullable: true }
 *               montoSolicitado: { type: number }
 *               cantidadCuotas: { type: integer }
 *               estado: { type: string }
 *               observaciones: { type: string }
 *     responses:
 *       201: { description: Solicitud creada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', authorize('admin', 'vendedor'), solicitudValidation.createSolicitud, validate, SolicitudFinanciacionController.create);

/**
 * @openapi
 * /financiacion-solicitudes/{id}:
 *   patch:
 *     tags: [Financiación]
 *     summary: Actualizar solicitud
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado: { type: string }
 *               montoSolicitado: { type: number }
 *               cantidadCuotas: { type: integer }
 *               observaciones: { type: string }
 *     responses:
 *       200: { description: Solicitud actualizada, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/InvalidStateTransition' }
 */
router.patch('/:id', authorize('admin', 'vendedor'), solicitudValidation.updateSolicitud, validate, SolicitudFinanciacionController.update);

/**
 * @openapi
 * /financiacion-solicitudes/{id}:
 *   delete:
 *     tags: [Financiación]
 *     summary: Eliminar solicitud (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authorize('admin'), SolicitudFinanciacionController.delete);

// Archivos adjuntos
/**
 * @openapi
 * /financiacion-solicitudes/{id}/archivos:
 *   get:
 *     tags: [Financiación]
 *     summary: Listar archivos adjuntos de la solicitud
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado de archivos, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/archivos', SolicitudFinanciacionController.listArchivos);

/**
 * @openapi
 * /financiacion-solicitudes/{id}/archivos/upload:
 *   post:
 *     tags: [Financiación]
 *     summary: Subir archivo adjunto a la solicitud (multipart)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *               tipo: { type: string }
 *               descripcion: { type: string }
 *     responses:
 *       201: { description: Archivo subido, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/archivos/upload', authorize('admin', 'vendedor'), uploadSingle, SolicitudFinanciacionController.uploadArchivo);

/**
 * @openapi
 * /financiacion-solicitudes/{id}/archivos/{archivoId}:
 *   delete:
 *     tags: [Financiación]
 *     summary: Eliminar archivo adjunto
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *       - { name: archivoId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Archivo eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id/archivos/:archivoId', authorize('admin', 'vendedor'), SolicitudFinanciacionController.deleteArchivo);

export default router;
