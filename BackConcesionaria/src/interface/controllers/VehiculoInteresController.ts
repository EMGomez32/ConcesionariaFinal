import { Request, Response, NextFunction } from 'express';
import { PrismaVehiculoInteresRepository } from '../../infrastructure/database/repositories/PrismaVehiculoInteresRepository';
import { GetInteresByCliente } from '../../application/use-cases/vehiculo-intereses/GetInteresByCliente';
import { GetInteresByVehiculo } from '../../application/use-cases/vehiculo-intereses/GetInteresByVehiculo';
import { CreateVehiculoInteres } from '../../application/use-cases/vehiculo-intereses/CreateVehiculoInteres';
import { DeleteVehiculoInteres } from '../../application/use-cases/vehiculo-intereses/DeleteVehiculoInteres';
import { audit } from '../../infrastructure/security/audit';
import { BaseException } from '../../domain/exceptions/BaseException';

const repository = new PrismaVehiculoInteresRepository();
const getByClienteUC = new GetInteresByCliente(repository);
const getByVehiculoUC = new GetInteresByVehiculo(repository);
const createUC = new CreateVehiculoInteres(repository);
const deleteUC = new DeleteVehiculoInteres(repository);

// Valida un id de path numérico. Sin esto, `parseInt('abc')` → NaN llega a Prisma
// como filtro Int inválido → PrismaClientValidationError → 500 genérico. Con el
// guard devolvemos un 400 limpio (mismo criterio que Sucursal/Reporte/MetaVenta).
function parseId(raw: unknown, label: string): number {
    const n = parseInt(String(raw), 10);
    if (!Number.isInteger(n) || n <= 0) {
        throw new BaseException(400, `${label} inválido`, 'INVALID_ID');
    }
    return n;
}

export class VehiculoInteresController {
    static async getByCliente(req: Request, res: Response, next: NextFunction) {
        try {
            const clienteId = parseId(req.params.clienteId, 'clienteId');
            const result = await getByClienteUC.execute(clienteId);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getByVehiculo(req: Request, res: Response, next: NextFunction) {
        try {
            const vehiculoId = parseId(req.params.vehiculoId, 'vehiculoId');
            const result = await getByVehiculoUC.execute(vehiculoId);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            // El use-case resuelve el tenant (token o, para super_admin, derivado del
            // cliente) — por eso el controller ya no pre-resuelve concesionariaId.
            const { entity, created } = await createUC.execute({ ...req.body });
            await audit({
                entidad: 'VehiculoInteres',
                accion: created ? 'create' : 'update',
                entidadId: entity?.id,
                detalle: `Interés del cliente ${entity?.clienteId} en el vehículo ${entity?.vehiculoId}`,
            });
            res.status(created ? 201 : 200).json(entity);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseId(req.params.id, 'id');
            await deleteUC.execute(id);
            await audit({
                entidad: 'VehiculoInteres',
                accion: 'delete',
                entidadId: id,
                detalle: `Interés ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
