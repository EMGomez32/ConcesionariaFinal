import { Request, Response, NextFunction } from 'express';
import { PrismaFinancieraRepository } from '../../infrastructure/database/repositories/PrismaFinancieraRepository';
import { GetFinancieras } from '../../application/use-cases/financieras/GetFinancieras';
import { GetFinancieraById } from '../../application/use-cases/financieras/GetFinancieraById';
import { CreateFinanciera } from '../../application/use-cases/financieras/CreateFinanciera';
import { UpdateFinanciera } from '../../application/use-cases/financieras/UpdateFinanciera';
import { DeleteFinanciera } from '../../application/use-cases/financieras/DeleteFinanciera';
import { context } from '../../infrastructure/security/context';
import { audit } from '../../infrastructure/security/audit';

const repository = new PrismaFinancieraRepository();
const getFinancierasUC = new GetFinancieras(repository);
const getFinancieraByIdUC = new GetFinancieraById(repository);
const createFinancieraUC = new CreateFinanciera(repository);
const updateFinancieraUC = new UpdateFinanciera(repository);
const deleteFinancieraUC = new DeleteFinanciera(repository);

export class FinancieraController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = context.getTenantId();
            const result = await getFinancierasUC.execute(tenantId!);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getFinancieraByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createFinancieraUC.execute(req.body);
            await audit({
                entidad: 'Financiera',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Financiera ${(result as any)?.nombre ?? (result as any)?.id} creada`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateFinancieraUC.execute(id, req.body);
            await audit({
                entidad: 'Financiera',
                accion: 'update',
                entidadId: id,
                detalle: `Financiera ${(result as any)?.nombre ?? id} actualizada`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteFinancieraUC.execute(id);
            await audit({
                entidad: 'Financiera',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Financiera ${id} eliminada`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
