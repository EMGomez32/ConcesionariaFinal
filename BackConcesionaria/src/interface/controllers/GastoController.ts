import { Request, Response, NextFunction } from 'express';
import { PrismaGastoRepository } from '../../infrastructure/database/repositories/PrismaGastoRepository';
import { GetGastos } from '../../application/use-cases/gastos/GetGastos';
import { GetGastoById } from '../../application/use-cases/gastos/GetGastoById';
import { CreateGasto } from '../../application/use-cases/gastos/CreateGasto';
import { UpdateGasto } from '../../application/use-cases/gastos/UpdateGasto';
import { DeleteGasto } from '../../application/use-cases/gastos/DeleteGasto';
import { audit } from '../../infrastructure/security/audit';
import prisma from '../../infrastructure/database/prisma';

const repository = new PrismaGastoRepository();
const getGastosUC = new GetGastos(repository);
const getGastoByIdUC = new GetGastoById(repository);
const createGastoUC = new CreateGasto(repository);
const updateGastoUC = new UpdateGasto(repository);
const deleteGastoUC = new DeleteGasto(repository);

export class GastoController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getGastosUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getGastoByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createGastoUC.execute(req.body);
            await audit({
                entidad: 'GastoVehiculo',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `GastoVehiculo ${(result as any)?.id} creado`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateGastoUC.execute(id, req.body);
            await audit({
                entidad: 'GastoVehiculo',
                accion: 'update',
                entidadId: id,
                detalle: `GastoVehiculo ${id} actualizado`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteGastoUC.execute(id);
            await audit({
                entidad: 'GastoVehiculo',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `GastoVehiculo ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    /** HU-47: total de gastos por vehículo. Acepta ?vehiculoId= */
    static async total(req: Request, res: Response, next: NextFunction) {
        try {
            const where: any = {};
            if (req.query.vehiculoId) where.vehiculoId = Number(req.query.vehiculoId);
            if (req.query.categoriaId) where.categoriaId = Number(req.query.categoriaId);
            if (req.query.proveedorId) where.proveedorId = Number(req.query.proveedorId);
            const r = await prisma.gastoVehiculo.aggregate({
                _sum: { monto: true },
                _count: true,
                where,
            });
            res.json({
                total: Number(r._sum.monto ?? 0),
                count: r._count,
                filters: where,
            });
        } catch (error) {
            next(error);
        }
    }
}
