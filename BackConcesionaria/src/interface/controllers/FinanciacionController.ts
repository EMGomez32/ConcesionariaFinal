import { Request, Response, NextFunction } from 'express';
import { PrismaFinanciacionRepository } from '../../infrastructure/database/repositories/PrismaFinanciacionRepository';
import { GetFinanciaciones } from '../../application/use-cases/financiaciones/GetFinanciaciones';
import { GetFinanciacionById } from '../../application/use-cases/financiaciones/GetFinanciacionById';
import { CreateFinanciacion } from '../../application/use-cases/financiaciones/CreateFinanciacion';
import { UpdateFinanciacion } from '../../application/use-cases/financiaciones/UpdateFinanciacion';
import { DeleteFinanciacion } from '../../application/use-cases/financiaciones/DeleteFinanciacion';
import { RegistrarPagoCuota } from '../../application/use-cases/financiaciones/RegistrarPagoCuota';
import { RefinanciarFinanciacion } from '../../application/use-cases/financiaciones/RefinanciarFinanciacion';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';

const repository = new PrismaFinanciacionRepository();
const refinanciarUC = new RefinanciarFinanciacion(repository);
const getFinanciacionesUC = new GetFinanciaciones(repository);
const getFinanciacionByIdUC = new GetFinanciacionById(repository);
const createFinanciacionUC = new CreateFinanciacion(repository);
const updateFinanciacionUC = new UpdateFinanciacion(repository);
const deleteFinanciacionUC = new DeleteFinanciacion(repository);
const registrarPagoUC = new RegistrarPagoCuota(repository);

export class FinanciacionController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getFinanciacionesUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getFinanciacionByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            const result = await createFinanciacionUC.execute({ ...req.body, concesionariaId });
            await audit({
                entidad: 'Financiacion',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Financiacion ${(result as any)?.id} creada`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async refinanciar(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await refinanciarUC.execute(id, req.body);
            await audit({
                entidad: 'Financiacion',
                accion: 'refinanciar',
                entidadId: (result as any)?.id,
                detalle: `Financiacion ${id} refinanciada en el contrato ${(result as any)?.id} por ${(result as any)?.montoFinanciado} ${(result as any)?.moneda}`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateFinanciacionUC.execute(id, req.body);
            await audit({
                entidad: 'Financiacion',
                accion: 'update',
                entidadId: id,
                detalle: `Financiacion ${id} actualizada`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteFinanciacionUC.execute(id);
            await audit({
                entidad: 'Financiacion',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Financiacion ${id} eliminada`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    static async pagarCuota(req: Request, res: Response, next: NextFunction) {
        try {
            const cuotaId = parseInt(req.params.cuotaId as string, 10);
            const result = await registrarPagoUC.execute(cuotaId, req.body);
            await audit({
                entidad: 'Financiacion',
                accion: 'update',
                entidadId: (result as any)?.financiacionId ?? (result as any)?.id ?? cuotaId,
                detalle: `Pago de cuota ${cuotaId} registrado`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
}
