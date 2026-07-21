import { Request, Response, NextFunction } from 'express';
import { PrismaReservaRepository } from '../../infrastructure/database/repositories/PrismaReservaRepository';
import { PrismaVehiculoRepository } from '../../infrastructure/database/repositories/PrismaVehiculoRepository';
import { GetReservas } from '../../application/use-cases/reservas/GetReservas';
import { GetReservaById } from '../../application/use-cases/reservas/GetReservaById';
import { CreateReserva } from '../../application/use-cases/reservas/CreateReserva';
import { UpdateReserva } from '../../application/use-cases/reservas/UpdateReserva';
import { DeleteReserva } from '../../application/use-cases/reservas/DeleteReserva';
import { audit } from '../../infrastructure/security/audit';

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

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateReservaUC.execute(id, req.body);
            await audit({
                entidad: 'Reserva',
                accion: 'update',
                entidadId: id,
                detalle: `Reserva ${id} actualizada`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteReservaUC.execute(id);
            await audit({
                entidad: 'Reserva',
                accion: 'cancel',
                entidadId: id,
                detalle: `Reserva ${id} cancelada`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
