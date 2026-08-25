import { Router } from 'express';
import { VehiculoArchivoController } from '../controllers/VehiculoArchivoController';
import { authorize } from '../middlewares/authorize.middleware';
import { uploadSingle } from '../middlewares/upload.middleware';

/**
 * CRITERIO DE PERMISOS: quien HACE el trabajo lo REGISTRA; ANULAR es del admin,
 * porque borrar el registro de una operación es con lo que se tapa un desvío.
 * `super_admin` tiene bypass en authorize(), no se nombra.
 *
 * Toda ruta que MUTA lleva `authorize(...)`: `router.use(authenticate)` exige
 * sesión, no rol, y los controllers no miran roles. Sin esto el perfil `lectura`
 * sube y borra fotos de las unidades por curl.
 *
 * DESVÍO DELIBERADO en el DELETE: acá la baja NO queda sólo en admin. Borrar una
 * foto mal sacada no tapa ningún desvío de plata —no hay importe, no hay estado
 * contable— y cerrarlo obligaría al vendedor que subió una foto girada a llamar
 * al dueño para que se la borre. El costo operativo es alto y la protección,
 * nula: es el caso donde aplicar la regla al pie sería peor que no aplicarla.
 */

const router = Router();

/**
 * @openapi
 * /vehiculo-archivos:
 *   post:
 *     tags: [Vehículos]
 *     summary: Crear archivo de vehículo (URL externa)
 *     description: >
 *       Registra un archivo asociado a un vehículo cuya URL ya está disponible
 *       (link externo, no upload). Requiere rol admin, vendedor o postventa.
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
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// Variante JSON legacy del upload: hoy no la llama nadie desde el front, pero se
// gatea igual con la misma lista que /upload — es la misma operación por otra vía.
router.post('/', authorize('admin', 'vendedor', 'postventa'), VehiculoArchivoController.create);

/**
 * @openapi
 * /vehiculo-archivos/upload:
 *   post:
 *     tags: [Vehículos]
 *     summary: Subir archivo de vehículo (multipart)
 *     description: >
 *       Persiste el binario via storage adapter y crea metadata en BD.
 *       Requiere rol admin, vendedor o postventa.
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
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// `postventa` entra porque documentar con fotos el estado de una unidad que pasó
// por el taller es parte de su trabajo, y hoy llega a esta ruta. `authorize` va
// ANTES de uploadSingle a propósito: así el 403 corta antes de que multer se
// ponga a recibir el binario de alguien que no tiene permiso para subirlo.
router.post('/upload', authorize('admin', 'vendedor', 'postventa'), uploadSingle, VehiculoArchivoController.upload);

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
 * /vehiculo-archivos/{id}/principal:
 *   patch:
 *     tags: [Vehículos]
 *     summary: Marcar un archivo como foto principal del vehículo
 *     description: >
 *       Marca esta foto como la principal (la que usa la ficha PDF y los listados)
 *       y desmarca las demás del mismo vehículo. Requiere rol admin o vendedor.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Archivo actualizado, content: { application/json: { schema: { type: object } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// Sin `postventa`: elegir la foto de portada es decisión comercial (es la que sale
// en los listados y en las publicaciones), no parte del trabajo de taller.
router.patch('/:id/principal', authorize('admin', 'vendedor'), VehiculoArchivoController.setPrincipal);

/**
 * @openapi
 * /vehiculo-archivos/{id}:
 *   delete:
 *     tags: [Vehículos]
 *     summary: Eliminar archivo de vehículo
 *     description: >
 *       Borra el binario del storage (best-effort) y el registro en BD.
 *       Requiere rol admin, vendedor o postventa.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// admin+vendedor+postventa, no sólo admin: ver el desvío explicado en la cabecera.
// `postventa` va incluido porque el argumento del desvío es SUYO tanto como del
// vendedor: es el único rol con permiso de subir (POST / y POST /upload) que no
// tenía forma de deshacerlo, y la única forma que tiene de adjuntar la foto del
// trabajo de chapa es esta ruta (sus propios routers no tienen upload). Quedaba
// pudiendo crear y no pudiendo corregir: subía la foto movida y tenía que pedirle
// a un vendedor que se la borre. Marcar la PORTADA sigue afuera (arriba): eso es
// decisión de venta, no de taller.
router.delete('/:id', authorize('admin', 'vendedor', 'postventa'), VehiculoArchivoController.delete);

export default router;
