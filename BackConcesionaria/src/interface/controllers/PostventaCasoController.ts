import { Request, Response, NextFunction } from 'express';
import { PrismaPostventaCasoRepository } from '../../infrastructure/database/repositories/PrismaPostventaCasoRepository';
import { GetCasos } from '../../application/use-cases/postventa-casos/GetCasos';
import { GetCasoById } from '../../application/use-cases/postventa-casos/GetCasoById';
import { CreateCaso } from '../../application/use-cases/postventa-casos/CreateCaso';
import { UpdateCaso } from '../../application/use-cases/postventa-casos/UpdateCaso';
import { DeleteCaso } from '../../application/use-cases/postventa-casos/DeleteCaso';
import { audit } from '../../infrastructure/security/audit';
import prisma from '../../infrastructure/database/prisma';

const repository = new PrismaPostventaCasoRepository();
const getCasosUC = new GetCasos(repository);
const getCasoByIdUC = new GetCasoById(repository);
const createCasoUC = new CreateCaso(repository);
const updateCasoUC = new UpdateCaso(repository);
const deleteCasoUC = new DeleteCaso(repository);

export class PostventaCasoController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getCasosUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getCasoByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createCasoUC.execute(req.body);
            await audit({
                entidad: 'PostventaCaso',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `PostventaCaso ${(result as any)?.id} creado`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateCasoUC.execute(id, req.body);
            await audit({
                entidad: 'PostventaCaso',
                accion: 'update',
                entidadId: id,
                detalle: `PostventaCaso ${id} actualizado`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteCasoUC.execute(id);
            await audit({
                entidad: 'PostventaCaso',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `PostventaCaso ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    /** HU-84: total de items del caso. */
    static async total(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const r = await prisma.postventaItem.aggregate({
                where: { casoId: id },
                _sum: { monto: true },
                _count: true,
            });
            res.json({
                casoId: id,
                total: Number(r._sum.monto ?? 0),
                count: r._count,
            });
        } catch (error) {
            next(error);
        }
    }
}
