import { Request, Response, NextFunction } from 'express';
import { PrismaTasacionRepository } from '../../infrastructure/database/repositories/PrismaTasacionRepository';
import { GetTasaciones } from '../../application/use-cases/tasaciones/GetTasaciones';
import { GetTasacionById } from '../../application/use-cases/tasaciones/GetTasacionById';
import { CreateTasacion } from '../../application/use-cases/tasaciones/CreateTasacion';
import { UpdateTasacion } from '../../application/use-cases/tasaciones/UpdateTasacion';
import { DeleteTasacion } from '../../application/use-cases/tasaciones/DeleteTasacion';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';

const repository = new PrismaTasacionRepository();
const getAllUC = new GetTasaciones(repository);
const getByIdUC = new GetTasacionById(repository);
const createUC = new CreateTasacion(repository);
const updateUC = new UpdateTasacion(repository);
const deleteUC = new DeleteTasacion(repository);

// Espejo del enum: un ?condicion arbitrario reventaría Prisma con un 500 (no es
// P-code, el error middleware no lo mapea). Valor inválido ⇒ se ignora el filtro.
const CONDICIONES = ['excelente', 'muy_bueno', 'bueno', 'regular', 'malo'];

export class TasacionController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, search, condicion } = req.query;
            const filter: any = {};
            if (search) filter.search = String(search);
            if (condicion && CONDICIONES.includes(String(condicion))) filter.condicion = String(condicion);
            const result = await getAllUC.execute(filter, {
                limit: limit ? Number(limit) : undefined,
                page: page ? Number(page) : undefined,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            const result = await createUC.execute({ ...req.body, concesionariaId });
            await audit({
                entidad: 'Tasacion',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Tasación ${(result as any)?.marca} ${(result as any)?.modelo}`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateUC.execute(id, req.body);
            await audit({
                entidad: 'Tasacion',
                accion: 'update',
                entidadId: id,
                detalle:
                    req.body?.valorEstimado != null
                        ? `Tasación ${id} tasada en ${req.body.valorEstimado}`
                        : `Tasación ${id} actualizada`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteUC.execute(id);
            await audit({
                entidad: 'Tasacion',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Tasación ${id} eliminada`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
