import { Request, Response, NextFunction } from 'express';
import { PrismaReservaRepository } from '../../infrastructure/database/repositories/PrismaReservaRepository';
import { PrismaVehiculoRepository } from '../../infrastructure/database/repositories/PrismaVehiculoRepository';
import { GetReservas } from '../../application/use-cases/reservas/GetReservas';
import { GetReservaById } from '../../application/use-cases/reservas/GetReservaById';
import { CreateReserva } from '../../application/use-cases/reservas/CreateReserva';
import { UpdateReserva } from '../../application/use-cases/reservas/UpdateReserva';
import { DeleteReserva } from '../../application/use-cases/reservas/DeleteReserva';
import { audit } from '../../infrastructure/security/audit';
import { actorEsAdmin } from '../../infrastructure/security/roles';
import { ForbiddenException } from '../../domain/exceptions/BaseException';

const repository = new PrismaReservaRepository();
const vehiculoRepository = new PrismaVehiculoRepository();
const getReservasUC = new GetReservas(repository);
const getReservaByIdUC = new GetReservaById(repository);
const createReservaUC = new CreateReserva(repository, vehiculoRepository);
const updateReservaUC = new UpdateReserva(repository);
const deleteReservaUC = new DeleteReserva(repository);

export class ReservaController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getReservasUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getReservaByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createReservaUC.execute(req.body);
            await audit({
                entidad: 'Reserva',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Reserva ${(result as any)?.id} creada`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Los campos de admin de una seña (PROC-33), cortados ANTES de validar el body:
     * si no, a un vendedor que manda `estado: 'cancelada'` se le contestaba 400
     * ("contá el motivo"), o sea que se le explicaba cómo completar algo que no le
     * corresponde. UpdateReserva lo vuelve a chequear contra el estado real.
     */
    static gateCampos(req: Request, _res: Response, next: NextFunction) {
        if (actorEsAdmin()) return next();
        if (req.body?.estado === 'cancelada') {
            return next(new ForbiddenException('Cancelar una seña es del administrador. Si el cliente se arrepintió, pedíselo con el motivo.'));
        }
        if (req.body?.monto !== undefined) {
            return next(new ForbiddenException('Cambiar el monto de una seña ya tomada es del administrador.'));
        }
        next();
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            // La auditoría (antes/después de cada campo que cambió, y el motivo si se
            // cancela) la escribe UpdateReserva dentro de su transacción.
            const result = await updateReservaUC.execute(id, req.body);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            // Auditoría con el motivo, dentro de la transacción de DeleteReserva.
            await deleteReservaUC.execute(id, { motivo: req.body.motivo });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
