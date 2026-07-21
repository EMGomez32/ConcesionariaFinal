import { Request, Response, NextFunction } from 'express';
import { PrismaPresupuestoRepository } from '../../infrastructure/database/repositories/PrismaPresupuestoRepository';
import { GetPresupuestos } from '../../application/use-cases/presupuestos/GetPresupuestos';
import { GetPresupuestoById } from '../../application/use-cases/presupuestos/GetPresupuestoById';
import { CreatePresupuesto } from '../../application/use-cases/presupuestos/CreatePresupuesto';
import { UpdatePresupuesto } from '../../application/use-cases/presupuestos/UpdatePresupuesto';
import { DeletePresupuesto } from '../../application/use-cases/presupuestos/DeletePresupuesto';
import { ConvertPresupuestoToVenta } from '../../application/use-cases/presupuestos/ConvertPresupuestoToVenta';
import { CreateVenta } from '../../application/use-cases/ventas/CreateVenta';
import { PrismaVentaRepository } from '../../infrastructure/database/repositories/PrismaVentaRepository';
import { PrismaVehiculoRepository } from '../../infrastructure/database/repositories/PrismaVehiculoRepository';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
import prisma from '../../infrastructure/database/prisma';

const repository = new PrismaPresupuestoRepository();
const getPresupuestosUC = new GetPresupuestos(repository);
const getPresupuestoByIdUC = new GetPresupuestoById(repository);
const createPresupuestoUC = new CreatePresupuesto(repository);
const updatePresupuestoUC = new UpdatePresupuesto(repository);
const deletePresupuestoUC = new DeletePresupuesto(repository);
const convertPresupuestoToVentaUC = new ConvertPresupuestoToVenta(
    repository,
    new CreateVenta(new PrismaVentaRepository(), new PrismaVehiculoRepository())
);

export class PresupuestoController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getPresupuestosUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getPresupuestoByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            // La concesionaria sale del token, no del body: el cliente nunca la
            // manda. El use-case la necesita para numerar el presupuesto, y va
            // después del spread para que un body malicioso no la pise.
            const result = await createPresupuestoUC.execute({
                ...req.body,
                concesionariaId: context.getTenantId(),
            });
            await audit({
                entidad: 'Presupuesto',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Presupuesto ${(result as any)?.id} creado`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updatePresupuestoUC.execute(id, req.body);
            await audit({
                entidad: 'Presupuesto',
                accion: 'update',
                entidadId: id,
                detalle: `Presupuesto ${id} actualizado`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deletePresupuestoUC.execute(id);
            await audit({
                entidad: 'Presupuesto',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Presupuesto ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    static async convertToVenta(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await convertPresupuestoToVentaUC.execute(id, req.body);
            await audit({
                entidad: 'Presupuesto',
                accion: 'update',
                entidadId: id,
                detalle: 'Presupuesto convertido en venta',
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * HU-60: total del presupuesto = sum(items.precioFinal) + sum(extras.monto)
     *        - canje.valorTomado.
     */
    static async total(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const [items, extras, canje] = await Promise.all([
                prisma.presupuestoItem.aggregate({
                    where: { presupuestoId: id },
                    _sum: { precioFinal: true },
                }),
                prisma.presupuestoExtra.aggregate({
                    where: { presupuestoId: id },
                    _sum: { monto: true },
                }),
                prisma.presupuestoCanje.findUnique({
                    where: { presupuestoId: id },
                    select: { valorTomado: true },
                }),
            ]);
            const subtotalItems = Number(items._sum.precioFinal ?? 0);
            const subtotalExtras = Number(extras._sum.monto ?? 0);
            const valorCanje = Number(canje?.valorTomado ?? 0);
            res.json({
                presupuestoId: id,
                subtotalItems,
                subtotalExtras,
                valorCanje,
                total: subtotalItems + subtotalExtras - valorCanje,
            });
        } catch (error) {
            next(error);
        }
    }
}
