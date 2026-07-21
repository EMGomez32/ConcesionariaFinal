import { Router } from 'express';
import { VehiculoArchivoController } from '../controllers/VehiculoArchivoController';
import { uploadSingle } from '../middlewares/upload.middleware';

const router = Router();

/**
 * @openapi
 * /vehiculo-archivos:
 *   post:
 *     tags: [Vehículos]
 *     summary: Crear archivo de vehículo (URL externa)
 *     description: Registra un archivo asociado a un vehículo cuya URL ya está disponible (link externo, no upload).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehiculoId, url]
 *             properties:
 *               vehiculoId: { type: integer }
 *               url: { type: string }
 *               tipo: { type: string }
 *               descripcion: { type: string }
 *     responses:
 *       201: { description: Archivo creado, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/', VehiculoArchivoController.create);

/**
 * @openapi
 * /vehiculo-archivos/upload:
 *   post:
 *     tags: [Vehículos]
 *     summary: Subir archivo de vehículo (multipart)
 *     description: Persiste el binario via storage adapter y crea metadata en BD.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, vehiculoId]
 *             properties:
 *               file: { type: string, format: binary }
 *               vehiculoId: { type: integer }
 *               tipo: { type: string }
 *               descripcion: { type: string }
 *     responses:
 *       201: { description: Archivo subido, content: { application/json: { schema: { type: object } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/upload', uploadSingle, VehiculoArchivoController.upload);

/**
 * @openapi
 * /vehiculo-archivos/vehiculo/{vehiculoId}:
 *   get:
 *     tags: [Vehículos]
 *     summary: Listar archivos de un vehículo
 *     parameters:
 *       - { name: vehiculoId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado de archivos, content: { application/json: { schema: { type: array, items: { type: object } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/vehiculo/:vehiculoId', VehiculoArchivoController.getByVehiculo);

/**
 * @openapi
 * /vehiculo-archivos/{id}:
 *   delete:
 *     tags: [Vehículos]
 *     summary: Eliminar archivo de vehículo
 *     description: Borra el binario del storage (best-effort) y el registro en BD.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', VehiculoArchivoController.delete);

export default router;
