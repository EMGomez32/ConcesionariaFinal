import { Request, Response, NextFunction } from 'express';
import { PrismaSolicitudFinanciacionRepository } from '../../infrastructure/database/repositories/PrismaSolicitudFinanciacionRepository';
import { GetSolicitudes } from '../../application/use-cases/financiacion-solicitudes/GetSolicitudes';
import { GetSolicitudById } from '../../application/use-cases/financiacion-solicitudes/GetSolicitudById';
import { CreateSolicitud } from '../../application/use-cases/financiacion-solicitudes/CreateSolicitud';
import { UpdateSolicitud } from '../../application/use-cases/financiacion-solicitudes/UpdateSolicitud';
import { DeleteSolicitud } from '../../application/use-cases/financiacion-solicitudes/DeleteSolicitud';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
import { storage } from '../../infrastructure/storage/LocalStorageAdapter';
import { BaseException } from '../../domain/exceptions/BaseException';
import prisma from '../../infrastructure/database/prisma';

const repository = new PrismaSolicitudFinanciacionRepository();
const getSolicitudesUC = new GetSolicitudes(repository);
const getSolicitudByIdUC = new GetSolicitudById(repository);
const createSolicitudUC = new CreateSolicitud(repository);
const updateSolicitudUC = new UpdateSolicitud(repository);
const deleteSolicitudUC = new DeleteSolicitud(repository);

export class SolicitudFinanciacionController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getSolicitudesUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getSolicitudByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createSolicitudUC.execute(req.body);
            await audit({
                entidad: 'SolicitudFinanciacion',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `SolicitudFinanciacion ${(result as any)?.id} creada`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateSolicitudUC.execute(id, req.body);
            await audit({
                entidad: 'SolicitudFinanciacion',
                accion: 'update',
                entidadId: id,
                detalle: `SolicitudFinanciacion ${id} actualizada`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteSolicitudUC.execute(id);
            await audit({
                entidad: 'SolicitudFinanciacion',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `SolicitudFinanciacion ${id} eliminada`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    // ----- Archivos adjuntos -----
    static async listArchivos(req: Request, res: Response, next: NextFunction) {
        try {
            const solicitudId = parseInt(req.params.id as string, 10);
            const archivos = await prisma.solicitudFinanciacionArchivo.findMany({
                where: { solicitudId },
                orderBy: { createdAt: 'desc' },
            });
            res.json(archivos);
        } catch (error) { next(error); }
    }

    static async uploadArchivo(req: Request, res: Response, next: NextFunction) {
        try {
            const solicitudId = parseInt(req.params.id as string, 10);
            const file = (req as any).file;
            if (!file) {
                throw new BaseException(400, 'Archivo requerido (campo "file")', 'VALIDATION_ERROR');
            }

            const solicitud = await getSolicitudByIdUC.execute(solicitudId);
            if (!solicitud) throw new BaseException(404, 'Solicitud no encontrada', 'NOT_FOUND');

            const saved = await storage.save(file, `solicitudes/${solicitudId}`);
            const user = context.getUser();

            const result = await prisma.solicitudFinanciacionArchivo.create({
                data: {
                    solicitudId,
                    tipo: req.body.tipo ?? null,
                    descripcion: req.body.descripcion ?? null,
                    url: saved.url,
                    storageKey: saved.storageKey,
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    sizeBytes: file.size,
                    uploadedById: user?.userId ?? null,
                },
            });

            await audit({
                entidad: 'SolicitudFinanciacionArchivo',
                accion: 'create',
                entidadId: result.id,
                detalle: `Archivo "${file.originalname}" subido a solicitud ${solicitudId}`,
            });

            res.status(201).json(result);
        } catch (error) { next(error); }
    }

    static async deleteArchivo(req: Request, res: Response, next: NextFunction) {
        try {
            const solicitudId = parseInt(req.params.id as string, 10);
            const archivoId = parseInt(req.params.archivoId as string, 10);
            const archivo = await prisma.solicitudFinanciacionArchivo.findUnique({ where: { id: archivoId } });
            if (!archivo) throw new BaseException(404, 'Archivo no encontrado', 'NOT_FOUND');
            // El archivo tiene que ser el de la solicitud de la URL: si no, un id
            // suelto permitiría borrar el adjunto de otra solicitud.
            if (archivo.solicitudId !== solicitudId) {
                throw new BaseException(404, 'Archivo no encontrado', 'NOT_FOUND');
            }

            if (archivo.storageKey) {
                try { await storage.delete(archivo.storageKey); } catch { /* best-effort */ }
            }

            await prisma.solicitudFinanciacionArchivo.delete({ where: { id: archivoId } });

            await audit({
                entidad: 'SolicitudFinanciacionArchivo',
                accion: 'delete_soft',
                entidadId: archivoId,
                detalle: `Archivo ${archivoId} eliminado de solicitud ${archivo.solicitudId}`,
            });

            res.status(204).send();
        } catch (error) { next(error); }
    }
}
