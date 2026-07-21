import { Request, Response, NextFunction } from 'express';
import { PrismaVehiculoArchivoRepository } from '../../infrastructure/database/repositories/PrismaVehiculoArchivoRepository';
import { GetArchivosByVehiculo } from '../../application/use-cases/vehiculo-archivos/GetArchivosByVehiculo';
import { CreateVehiculoArchivo } from '../../application/use-cases/vehiculo-archivos/CreateVehiculoArchivo';
import { DeleteVehiculoArchivo } from '../../application/use-cases/vehiculo-archivos/DeleteVehiculoArchivo';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
import { storage } from '../../infrastructure/storage/LocalStorageAdapter';
import { BaseException } from '../../domain/exceptions/BaseException';

const repository = new PrismaVehiculoArchivoRepository();
const getByVehiculoUC = new GetArchivosByVehiculo(repository);
const createUC = new CreateVehiculoArchivo(repository);
const deleteUC = new DeleteVehiculoArchivo(repository);

export class VehiculoArchivoController {
    static async getByVehiculo(req: Request, res: Response, next: NextFunction) {
        try {
            const vehiculoId = parseInt(req.params.vehiculoId as string, 10);
            const result = await getByVehiculoUC.execute(vehiculoId);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    /** Legacy: JSON body con `url` ya conocida (link externo). */
    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createUC.execute(req.body);
            await audit({
                entidad: 'VehiculoArchivo',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `VehiculoArchivo ${(result as any)?.id} creado (URL externa)`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    /** Multipart upload: persiste binario via storage adapter + metadata rica en BD. */
    static async upload(req: Request, res: Response, next: NextFunction) {
        try {
            const file = (req as any).file;
            if (!file) {
                throw new BaseException(400, 'Archivo requerido (campo "file")', 'VALIDATION_ERROR');
            }

            const vehiculoId = parseInt(req.body.vehiculoId, 10);
            if (!vehiculoId) {
                throw new BaseException(400, 'vehiculoId es obligatorio', 'VALIDATION_ERROR');
            }

            const saved = await storage.save(file, `vehiculos/${vehiculoId}`);
            const user = context.getUser();

            const result = await createUC.execute({
                vehiculoId,
                tipo: req.body.tipo ?? null,
                descripcion: req.body.descripcion ?? null,
                url: saved.url,
                storageKey: saved.storageKey,
                originalName: file.originalname,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                uploadedById: user?.userId ?? null,
            });

            await audit({
                entidad: 'VehiculoArchivo',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Archivo "${file.originalname}" subido a vehículo ${vehiculoId}`,
            });

            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const existing: any = await repository.findById(id);
            if (existing?.storageKey) {
                try { await storage.delete(existing.storageKey); } catch { /* best-effort */ }
            }
            await deleteUC.execute(id);
            await audit({
                entidad: 'VehiculoArchivo',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `VehiculoArchivo ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
