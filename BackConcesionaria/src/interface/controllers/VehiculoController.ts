import { Request, Response, NextFunction } from 'express';
import { PrismaVehiculoRepository } from '../../infrastructure/database/repositories/PrismaVehiculoRepository';
import { GetVehiculos } from '../../application/use-cases/vehiculos/GetVehiculos';
import { GetVehiculoById } from '../../application/use-cases/vehiculos/GetVehiculoById';
import { CreateVehiculo } from '../../application/use-cases/vehiculos/CreateVehiculo';
import { UpdateVehiculo } from '../../application/use-cases/vehiculos/UpdateVehiculo';
import { DeleteVehiculo } from '../../application/use-cases/vehiculos/DeleteVehiculo';
import { TransferVehiculo } from '../../application/use-cases/vehiculos/TransferVehiculo';
import { audit } from '../../infrastructure/security/audit';

const repository = new PrismaVehiculoRepository();
const getVehiculosUC = new GetVehiculos(repository);
const getVehiculoByIdUC = new GetVehiculoById(repository);
const createVehiculoUC = new CreateVehiculo(repository);
const updateVehiculoUC = new UpdateVehiculo(repository);
const deleteVehiculoUC = new DeleteVehiculo(repository);
const transferVehiculoUC = new TransferVehiculo(repository);

export class VehiculoController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, search, marca, modelo, dominio, estado, tipo, sucursalId } = req.query;

            // Construir el WHERE de Prisma a partir de los query params.
            // `search` busca por marca/modelo/dominio (parcial, insensible a mayúsculas).
            const where: any = {};
            const term = (search ?? marca) as string | undefined;
            if (term) {
                where.OR = [
                    { marca: { contains: String(term), mode: 'insensitive' } },
                    { modelo: { contains: String(term), mode: 'insensitive' } },
                    { dominio: { contains: String(term), mode: 'insensitive' } },
                ];
            }
            if (modelo) where.modelo = { contains: String(modelo), mode: 'insensitive' };
            if (dominio) where.dominio = { contains: String(dominio), mode: 'insensitive' };
            // `estado` acepta uno o varios separados por coma (ej:
            // "publicado,preparacion"), para selectores que necesitan más de un
            // estado. Un solo valor sigue funcionando igual que antes.
            if (estado) {
                const estados = String(estado).split(',').map((e) => e.trim()).filter(Boolean);
                where.estado = estados.length > 1 ? { in: estados } : estados[0];
            }
            if (tipo) where.tipo = tipo;
            if (sucursalId) where.sucursalId = Number(sucursalId); // query param llega como string

            const result = await getVehiculosUC.execute(where, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getVehiculoByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createVehiculoUC.execute(req.body);
            const label = (result as any)?.patente ?? (result as any)?.marca ?? (result as any)?.id;
            await audit({
                entidad: 'Vehiculo',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Vehiculo ${label} creado`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateVehiculoUC.execute(id, req.body);
            await audit({
                entidad: 'Vehiculo',
                accion: 'update',
                entidadId: id,
                detalle: `Vehiculo ${id} actualizado`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteVehiculoUC.execute(id);
            await audit({
                entidad: 'Vehiculo',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Vehiculo ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    static async transferir(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const { sucursalDestinoId, motivo } = req.body;
            const result = await transferVehiculoUC.execute(id, Number(sucursalDestinoId), motivo);
            await audit({
                entidad: 'Vehiculo',
                accion: 'update',
                entidadId: id,
                detalle: `Vehículo transferido a sucursal ${sucursalDestinoId}`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
}
