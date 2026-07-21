import { Request, Response, NextFunction } from 'express';
import { PrismaTipoPostventaRepository } from '../../infrastructure/database/repositories/PrismaTipoPostventaRepository';
import { GetTiposPostventa } from '../../application/use-cases/postventa-tipos/GetTiposPostventa';
import { CreateTipoPostventa } from '../../application/use-cases/postventa-tipos/CreateTipoPostventa';
import { UpdateTipoPostventa } from '../../application/use-cases/postventa-tipos/UpdateTipoPostventa';
import { DeleteTipoPostventa } from '../../application/use-cases/postventa-tipos/DeleteTipoPostventa';
import { context } from '../../infrastructure/security/context';
import { audit } from '../../infrastructure/security/audit';

const repository = new PrismaTipoPostventaRepository();
const getTiposUC = new GetTiposPostventa(repository);
const createTipoUC = new CreateTipoPostventa(repository);
const updateTipoUC = new UpdateTipoPostventa(repository);
const deleteTipoUC = new DeleteTipoPostventa(repository);

export class TipoPostventaController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = context.getTenantId();
            const result = await getTiposUC.execute(tenantId!);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createTipoUC.execute(req.body);
            await audit({
                entidad: 'TipoPostventa',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Tipo de postventa "${(result as any)?.nombre}" creado`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateTipoUC.execute(id, req.body);
            await audit({
                entidad: 'TipoPostventa',
                accion: 'update',
                entidadId: id,
                detalle: `Tipo de postventa ${id} actualizado a "${(result as any)?.nombre}"`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteTipoUC.execute(id);
            await audit({
                entidad: 'TipoPostventa',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Tipo de postventa ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
