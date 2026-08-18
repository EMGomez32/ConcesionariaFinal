import { Request, Response, NextFunction } from 'express';
import { PrismaConcesionariaRepository } from '../../infrastructure/database/repositories/PrismaConcesionariaRepository';
import { GetConcesionarias } from '../../application/use-cases/concesionarias/GetConcesionarias';
import { GetConcesionariaById } from '../../application/use-cases/concesionarias/GetConcesionariaById';
import { CreateConcesionaria } from '../../application/use-cases/concesionarias/CreateConcesionaria';
import { UpdateConcesionaria } from '../../application/use-cases/concesionarias/UpdateConcesionaria';
import { DeleteConcesionaria } from '../../application/use-cases/concesionarias/DeleteConcesionaria';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
import { storage } from '../../infrastructure/storage/LocalStorageAdapter';
import { sniffImageType } from '../middlewares/upload.middleware';
import { BaseException, NotFoundException } from '../../domain/exceptions/BaseException';

const repository = new PrismaConcesionariaRepository();
const getConcesionariasUC = new GetConcesionarias(repository);
const getConcesionariaByIdUC = new GetConcesionariaById(repository);
const createConcesionariaUC = new CreateConcesionaria(repository);
const updateConcesionariaUC = new UpdateConcesionaria(repository);
const deleteConcesionariaUC = new DeleteConcesionaria(repository);

export class ConcesionariaController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getConcesionariasUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getConcesionariaByIdUC.execute(id);
            // usuariosActivos: uso actual del cupo (limiteUsuarios). Se adjunta para
            // que el panel muestre "usados / límite" sin una segunda llamada.
            const usuariosActivos = await repository.countActiveUsuarios(id);
            res.json({ ...result, usuariosActivos });
        } catch (error) {
            next(error);
        }
    }

    // ── Autogestión del tenant propio ─────────────────────────────────────────
    // La concesionaria sale del token (context), no de un param: un admin sólo
    // puede ver/editar LA SUYA. El CRUD general de /concesionarias sigue siendo
    // exclusivo de super_admin (administra TODOS los tenants).

    static async getMine(req: Request, res: Response, next: NextFunction) {
        try {
            const cid = context.getUser()?.concesionariaId;
            if (!cid) throw new NotFoundException('Concesionaria');
            const result = await getConcesionariaByIdUC.execute(cid);
            // El admin ve su propio cupo: limiteUsuarios viene en la entidad y
            // usuariosActivos es el uso actual (para el contador de la pantalla de
            // Usuarios y el bloqueo del botón al llegar al tope).
            const usuariosActivos = await repository.countActiveUsuarios(cid);
            res.json({ ...result, usuariosActivos });
        } catch (error) {
            next(error);
        }
    }

    static async updateMine(req: Request, res: Response, next: NextFunction) {
        try {
            const cid = context.getUser()?.concesionariaId;
            if (!cid) throw new NotFoundException('Concesionaria');
            // Whitelist: el use case pasa el body crudo a Prisma, así que se
            // filtran acá los campos editables. Sin esto un admin podría escribir
            // cualquier columna del tenant desde este endpoint. `logoUrl` y
            // `logoStorageKey` NO están: el logo sólo se toca vía /me/logo.
            const CAMPOS = ['nombre', 'cuit', 'email', 'telefono', 'direccion',
                'colorPrimario', 'colorSecundario', 'pdfPie', 'sitioWeb',
                // Datos fiscales del emisor (AFIP). afipEntorno NO se expone acá:
                // queda en 'mock' hasta que el Corte 2 sume la carga del certificado.
                'razonSocial', 'condicionIva', 'puntoVenta'];
            const data: Record<string, any> = {};
            for (const campo of CAMPOS) {
                if (req.body?.[campo] !== undefined) {
                    data[campo] = req.body[campo] === '' ? null : req.body[campo];
                }
            }
            if (!data.nombre && data.nombre !== undefined) {
                throw new BaseException(400, 'El nombre no puede quedar vacío', 'VALIDATION_ERROR');
            }
            const result = await updateConcesionariaUC.execute(cid, data);
            await audit({
                entidad: 'Concesionaria',
                accion: 'update',
                entidadId: cid,
                detalle: `Concesionaria ${(result as any)?.nombre ?? cid} actualizada (autogestión)`,
                concesionariaId: cid,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    // POST /concesionarias/me/logo (multipart, admin) → sube el logo de marca del
    // tenant propio, lo persiste vía storage adapter y borra el logo anterior.
    static async uploadLogo(req: Request, res: Response, next: NextFunction) {
        try {
            const cid = context.getUser()?.concesionariaId;
            if (!cid) throw new NotFoundException('Concesionaria');

            const file = (req as any).file;
            if (!file) {
                throw new BaseException(400, 'Logo requerido (campo "file", PNG o JPG)', 'VALIDATION_ERROR');
            }

            // No se confía en el mimetype declarado por el cliente (falsificable):
            // se valida el contenido real por magic-bytes. Y la extensión guardada
            // se DERIVA del tipo detectado, nunca del originalname del cliente, para
            // que no se pueda plantar un .html/.js/.svg servido desde /uploads.
            const tipo = sniffImageType(file.buffer);
            if (!tipo) {
                throw new BaseException(400, 'El logo debe ser una imagen PNG o JPG válida', 'VALIDATION_ERROR');
            }
            file.originalname = tipo === 'png' ? 'logo.png' : 'logo.jpg';

            // Se resuelve el logo anterior ANTES de pisar las columnas, para
            // borrar su binario después (best-effort) y no dejar huérfanos.
            const actual: any = await getConcesionariaByIdUC.execute(cid);
            const prevKey: string | null = actual?.logoStorageKey ?? null;

            const saved = await storage.save(file, `concesionarias/${cid}/branding`);
            const result = await updateConcesionariaUC.execute(cid, {
                logoUrl: saved.url,
                logoStorageKey: saved.storageKey,
            });

            if (prevKey && prevKey !== saved.storageKey) {
                try { await storage.delete(prevKey); } catch { /* best-effort */ }
            }

            await audit({
                entidad: 'Concesionaria',
                accion: 'update',
                entidadId: cid,
                detalle: `Logo de la concesionaria ${cid} actualizado`,
                concesionariaId: cid,
            });

            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    // DELETE /concesionarias/me/logo (admin) → quita el logo (vuelve al default).
    static async deleteLogo(req: Request, res: Response, next: NextFunction) {
        try {
            const cid = context.getUser()?.concesionariaId;
            if (!cid) throw new NotFoundException('Concesionaria');

            const actual: any = await getConcesionariaByIdUC.execute(cid);
            const prevKey: string | null = actual?.logoStorageKey ?? null;

            const result = await updateConcesionariaUC.execute(cid, {
                logoUrl: null,
                logoStorageKey: null,
            });

            if (prevKey) {
                try { await storage.delete(prevKey); } catch { /* best-effort */ }
            }

            await audit({
                entidad: 'Concesionaria',
                accion: 'update',
                entidadId: cid,
                detalle: `Logo de la concesionaria ${cid} eliminado`,
                concesionariaId: cid,
            });

            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createConcesionariaUC.execute(req.body);
            await audit({
                entidad: 'Concesionaria',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Concesionaria ${(result as any)?.nombre ?? (result as any)?.id} creada`,
                concesionariaId: (result as any)?.id,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateConcesionariaUC.execute(id, req.body);
            await audit({
                entidad: 'Concesionaria',
                accion: 'update',
                entidadId: id,
                detalle: `Concesionaria ${(result as any)?.nombre ?? id} actualizada`,
                concesionariaId: id,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteConcesionariaUC.execute(id);
            await audit({
                entidad: 'Concesionaria',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Concesionaria ${id} eliminada`,
                concesionariaId: id,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
