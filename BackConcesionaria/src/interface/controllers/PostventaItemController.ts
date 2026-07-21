import { Request, Response, NextFunction } from 'express';
import { PrismaPostventaItemRepository } from '../../infrastructure/database/repositories/PrismaPostventaItemRepository';
import { GetItemsByCaso } from '../../application/use-cases/postventa-items/GetItemsByCaso';
import { CreatePostventaItem } from '../../application/use-cases/postventa-items/CreatePostventaItem';
import { DeletePostventaItem } from '../../application/use-cases/postventa-items/DeletePostventaItem';
import { audit } from '../../infrastructure/security/audit';

const repository = new PrismaPostventaItemRepository();
const getItemsByCasoUC = new GetItemsByCaso(repository);
const createItemUC = new CreatePostventaItem(repository);
const deleteItemUC = new DeletePostventaItem(repository);

export class PostventaItemController {
    static async getByCaso(req: Request, res: Response, next: NextFunction) {
        try {
            const casoId = parseInt(req.params.casoId as string, 10);
            const result = await getItemsByCasoUC.execute(casoId);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createItemUC.execute(req.body);
            await audit({
                entidad: 'PostventaItem',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `PostventaItem ${(result as any)?.id} creado`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteItemUC.execute(id);
            await audit({
                entidad: 'PostventaItem',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `PostventaItem ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
