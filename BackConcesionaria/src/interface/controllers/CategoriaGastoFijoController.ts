import { Request, Response, NextFunction } from 'express';
import { PrismaCategoriaGastoFijoRepository } from '../../infrastructure/database/repositories/PrismaCategoriaGastoFijoRepository';
import { GetCategoriasGastoFijo } from '../../application/use-cases/gastos-fijos-categorias/GetCategoriasGastoFijo';
import { CreateCategoriaGastoFijo } from '../../application/use-cases/gastos-fijos-categorias/CreateCategoriaGastoFijo';
import { UpdateCategoriaGastoFijo } from '../../application/use-cases/gastos-fijos-categorias/UpdateCategoriaGastoFijo';
import { DeleteCategoriaGastoFijo } from '../../application/use-cases/gastos-fijos-categorias/DeleteCategoriaGastoFijo';
import { context } from '../../infrastructure/security/context';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { audit } from '../../infrastructure/security/audit';

const repository = new PrismaCategoriaGastoFijoRepository();
const getCategoriasUC = new GetCategoriasGastoFijo(repository);
const createCategoriaUC = new CreateCategoriaGastoFijo(repository);
const updateCategoriaUC = new UpdateCategoriaGastoFijo(repository);
const deleteCategoriaUC = new DeleteCategoriaGastoFijo(repository);

export class CategoriaGastoFijoController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = context.getTenantId();
            const result = await getCategoriasUC.execute(tenantId!);
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
                entidad: 'CategoriaGastoFijo',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `CategoriaGastoFijo ${(result as any)?.nombre ?? (result as any)?.id} creada`,
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
                entidad: 'CategoriaGastoFijo',
                accion: 'update',
                entidadId: id,
                detalle: `CategoriaGastoFijo ${id} actualizada`,
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
                entidad: 'CategoriaGastoFijo',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `CategoriaGastoFijo ${id} eliminada`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
