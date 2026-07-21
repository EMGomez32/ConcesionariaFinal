import { Request, Response, NextFunction } from 'express';
import { PrismaIngresoVehiculoRepository } from '../../infrastructure/database/repositories/PrismaIngresoVehiculoRepository';
import { GetIngresosVehiculo } from '../../application/use-cases/vehiculo-ingresos/GetIngresosVehiculo';
import { GetIngresoVehiculoById } from '../../application/use-cases/vehiculo-ingresos/GetIngresoVehiculoById';
import { CreateIngresoVehiculo } from '../../application/use-cases/vehiculo-ingresos/CreateIngresoVehiculo';
import { DeleteIngresoVehiculo } from '../../application/use-cases/vehiculo-ingresos/DeleteIngresoVehiculo';
import { audit } from '../../infrastructure/security/audit';

const repository = new PrismaIngresoVehiculoRepository();
const getIngresosUC = new GetIngresosVehiculo(repository);
const getByIdUC = new GetIngresoVehiculoById(repository);
const createUC = new CreateIngresoVehiculo(repository);
const deleteUC = new DeleteIngresoVehiculo(repository);

export class IngresoVehiculoController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, startDate, endDate, ...filters } = req.query as any;

            // HU-37: filtros por rango de fechas. Convertir a Prisma `gte`/`lte`.
            if (startDate || endDate) {
                const range: any = {};
                if (startDate) range.gte = new Date(String(startDate));
                if (endDate) range.lte = new Date(String(endDate));
                filters.fecha = range;
            }

            const result = await getIngresosUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
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
            const result = await createUC.execute(req.body);
            await audit({
                entidad: 'IngresoVehiculo',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `IngresoVehiculo ${(result as any)?.id} creado`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteUC.execute(id);
            await audit({
                entidad: 'IngresoVehiculo',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `IngresoVehiculo ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
