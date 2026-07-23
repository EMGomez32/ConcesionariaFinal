import { Request, Response, NextFunction } from 'express';
import { PrismaCategoriaGastoRepository } from '../../infrastructure/database/repositories/PrismaCategoriaGastoRepository';
import { GetCategoriasGasto } from '../../application/use-cases/gastos-categorias/GetCategoriasGasto';
import { CreateCategoriaGasto } from '../../application/use-cases/gastos-categorias/CreateCategoriaGasto';
import { UpdateCategoriaGasto } from '../../application/use-cases/gastos-categorias/UpdateCategoriaGasto';
import { DeleteCategoriaGasto } from '../../application/use-cases/gastos-categorias/DeleteCategoriaGasto';
import { context } from '../../infrastructure/security/context';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { audit } from '../../infrastructure/security/audit';

const repository = new PrismaCategoriaGastoRepository();
const getCategoriasUC = new GetCategoriasGasto(repository);
const createCategoriaUC = new CreateCategoriaGasto(repository);
const updateCategoriaUC = new UpdateCategoriaGasto(repository);
const deleteCategoriaUC = new DeleteCategoriaGasto(repository);

export class CategoriaGastoController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = context.getTenantId();
            const result = await getCategoriasUC.execute(tenantId!, { activo: req.query.activo });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            const result = await createCategoriaUC.execute({ ...req.body, concesionariaId });
            await audit({
                entidad: 'CategoriaGastoVehiculo',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `CategoriaGastoVehiculo ${(result as any)?.nombre ?? (result as any)?.id} creada`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateCategoriaUC.execute(id, req.body);
            await audit({
                entidad: 'CategoriaGastoVehiculo',
                accion: 'update',
                entidadId: id,
                detalle: `CategoriaGastoVehiculo ${id} actualizada`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteCategoriaUC.execute(id);
            await audit({
                entidad: 'CategoriaGastoVehiculo',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `CategoriaGastoVehiculo ${id} eliminada`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
