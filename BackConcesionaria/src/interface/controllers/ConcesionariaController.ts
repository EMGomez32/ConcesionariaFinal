import { Request, Response, NextFunction } from 'express';
import { PrismaConcesionariaRepository } from '../../infrastructure/database/repositories/PrismaConcesionariaRepository';
import { GetConcesionarias } from '../../application/use-cases/concesionarias/GetConcesionarias';
import { GetConcesionariaById } from '../../application/use-cases/concesionarias/GetConcesionariaById';
import { CreateConcesionaria } from '../../application/use-cases/concesionarias/CreateConcesionaria';
import { UpdateConcesionaria } from '../../application/use-cases/concesionarias/UpdateConcesionaria';
import { DeleteConcesionaria } from '../../application/use-cases/concesionarias/DeleteConcesionaria';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
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
            res.json(result);
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
            res.json(result);
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
            // cualquier columna del tenant desde este endpoint.
            const CAMPOS = ['nombre', 'cuit', 'email', 'telefono', 'direccion'];
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
