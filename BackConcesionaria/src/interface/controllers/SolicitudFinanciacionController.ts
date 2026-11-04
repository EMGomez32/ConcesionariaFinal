import { Request, Response, NextFunction } from 'express';
import { PrismaSolicitudFinanciacionRepository } from '../../infrastructure/database/repositories/PrismaSolicitudFinanciacionRepository';
import { GetSolicitudes } from '../../application/use-cases/financiacion-solicitudes/GetSolicitudes';
import { GetSolicitudById } from '../../application/use-cases/financiacion-solicitudes/GetSolicitudById';
import { CreateSolicitud } from '../../application/use-cases/financiacion-solicitudes/CreateSolicitud';
import { UpdateSolicitud } from '../../application/use-cases/financiacion-solicitudes/UpdateSolicitud';
import { DeleteSolicitud } from '../../application/use-cases/financiacion-solicitudes/DeleteSolicitud';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { storage } from '../../infrastructure/storage/LocalStorageAdapter';
import { BaseException, ForbiddenException } from '../../domain/exceptions/BaseException';
import prisma from '../../infrastructure/database/prisma';
import { conUrlParaCliente, prefijoAdjuntosSolicitud } from '../../infrastructure/storage/zonaPrivada';
import { actorTieneRol } from '../../infrastructure/security/roles';
import { filtroCartera } from '../../application/services/carteraCliente';

const repository = new PrismaSolicitudFinanciacionRepository();
const getSolicitudesUC = new GetSolicitudes(repository);
const getSolicitudByIdUC = new GetSolicitudById(repository);
const createSolicitudUC = new CreateSolicitud(repository);
const updateSolicitudUC = new UpdateSolicitud(repository);
const deleteSolicitudUC = new DeleteSolicitud(repository);

/**
 * ¿El actor puede ver los ADJUNTOS de una solicitud (DNI, recibos de sueldo)?
 *
 * La solicitud en sí (banco, monto, estado) la ven admin, vendedor y `lectura` (ver las
 * rutas). Los papeles, sólo quien arma el legajo: admin y vendedor —el contador no
 * necesita el DNI escaneado de cada cliente—. Y el vendedor "puro", sólo los de clientes
 * de SU cartera: es la misma regla que recorta el listado de clientes (carteraCliente.ts),
 * aplicada al dato más sensible que cuelga de un cliente.
 */
async function puedeVerAdjuntos(clienteId: number): Promise<boolean> {
    if (!actorTieneRol('admin', 'vendedor')) return false;
    const filtro = await filtroCartera();
    if (!filtro) return true;
    const enCartera = await prisma.cliente.count({ where: { AND: [{ id: clienteId }, filtro] } });
    return enCartera > 0;
}

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
            const result: any = await getSolicitudByIdUC.execute(id);
            // El detalle trae los adjuntos con URL firmada: sólo para quien puede verlos.
            if (!(await puedeVerAdjuntos(result.clienteId))) {
                res.json({ ...result, archivos: undefined });
                return;
            }
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            const result = await createSolicitudUC.execute({ ...req.body, concesionariaId });
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
            // La solicitud tiene que existir (y no estar dada de baja) en el tenant del actor.
            const solicitud: any = await getSolicitudByIdUC.execute(solicitudId);
            if (!(await puedeVerAdjuntos(solicitud.clienteId))) {
                throw new ForbiddenException('Los papeles de esta solicitud los ve el administrador o el vendedor que atiende al cliente.');
            }
            const archivos = await prisma.solicitudFinanciacionArchivo.findMany({
                where: { solicitudId },
                orderBy: { createdAt: 'desc' },
            });
            // Los adjuntos (DNI, recibos) son PRIVADOS: la url que sale de acá es una URL firmada
            // y con vencimiento; la que está guardada en la base no abre nada por sí sola.
            res.json(archivos.map((a) => conUrlParaCliente(a)));
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

            // Zona PRIVADA de /uploads (sólo con URL firmada): ver storage/zonaPrivada.ts.
            const saved = await storage.save(file, prefijoAdjuntosSolicitud(solicitudId));
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

            res.status(201).json(conUrlParaCliente(result));
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
