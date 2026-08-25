import { Request, Response, NextFunction } from 'express';
import { PrismaVentaRepository } from '../../infrastructure/database/repositories/PrismaVentaRepository';
import { PrismaVehiculoRepository } from '../../infrastructure/database/repositories/PrismaVehiculoRepository';
import { GetVentas } from '../../application/use-cases/ventas/GetVentas';
import { GetVentaById } from '../../application/use-cases/ventas/GetVentaById';
import { CreateVenta } from '../../application/use-cases/ventas/CreateVenta';
import { UpdateVenta } from '../../application/use-cases/ventas/UpdateVenta';
import { ChangeEstadoEntrega } from '../../application/use-cases/ventas/ChangeEstadoEntrega';
import { DeleteVenta } from '../../application/use-cases/ventas/DeleteVenta';
import { audit } from '../../infrastructure/security/audit';
import { actorEsAdmin } from '../../infrastructure/security/roles';
import { ForbiddenException } from '../../domain/exceptions/BaseException';

const repository = new PrismaVentaRepository();
const vehiculoRepository = new PrismaVehiculoRepository();
const getVentasUC = new GetVentas(repository);
const getVentaByIdUC = new GetVentaById(repository);
const createVentaUC = new CreateVenta(repository, vehiculoRepository);
const updateVentaUC = new UpdateVenta(repository);
const changeEstadoEntregaUC = new ChangeEstadoEntrega(repository);
const deleteVentaUC = new DeleteVenta(repository);

export class VentaController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getVentasUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getVentaByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createVentaUC.execute(req.body);
            await audit({
                entidad: 'Venta',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Venta ${(result as any)?.id} creada`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateVentaUC.execute(id, req.body);
            await audit({
                entidad: 'Venta',
                accion: 'update',
                entidadId: id,
                detalle: `Venta ${id} actualizada`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * ESTADOS DE ENTREGA QUE SÓLO PUEDE FIJAR UN ADMIN.
     *
     * `cancelada` no es una transición más de la máquina de estados: es la anulación
     * de la operación (el front la rotula, literalmente, "Anular Operación"). Es
     * TERMINAL —stateMachine.ts no le da ninguna salida, ni siquiera para el admin—
     * y NO revierte nada: el vehículo sigue en `vendido` y la venta sigue sumando en
     * los reportes. La única forma de destrabarla es DELETE /ventas/:id, que es admin.
     *
     * Por eso el `authorize` de la ruta no alcanza: es de grano grueso, evalúa antes
     * de ver el body, y habilitar `entregada` para postventa —que es su trabajo real—
     * le regalaba `cancelada` de yapa, al lado del botón que usa todos los días.
     */
    private static readonly ESTADOS_ENTREGA_DE_ADMIN = ['cancelada'];

    static async changeEstadoEntrega(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const { estadoEntrega } = req.body;
            if (VentaController.ESTADOS_ENTREGA_DE_ADMIN.includes(estadoEntrega) && !actorEsAdmin()) {
                throw new ForbiddenException(
                    'Anular una operación es del administrador. Podés avanzar la entrega, no cancelarla.'
                );
            }
            const result = await changeEstadoEntregaUC.execute(id, estadoEntrega);
            await audit({
                entidad: 'Venta',
                accion: 'update',
                entidadId: id,
                detalle: `Estado de entrega: ${estadoEntrega}`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteVentaUC.execute(id);
            await audit({
                entidad: 'Venta',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Venta ${id} eliminada`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    // ----- Sub-recursos: pagos -----
    static async listPagos(req: Request, res: Response, next: NextFunction) {
        try {
            const ventaId = parseInt(req.params.id as string, 10);
            res.json(await repository.listPagos(ventaId));
        } catch (error) { next(error); }
    }

    static async addPago(req: Request, res: Response, next: NextFunction) {
        try {
            const ventaId = parseInt(req.params.id as string, 10);
            const result = await repository.addPago(ventaId, req.body);
            await audit({
                entidad: 'VentaPago',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Pago ${(result as any)?.id} agregado a venta ${ventaId}`,
            });
            res.status(201).json(result);
        } catch (error) { next(error); }
    }

    static async removePago(req: Request, res: Response, next: NextFunction) {
        try {
            const ventaId = parseInt(req.params.id as string, 10);
            const pagoId = parseInt(req.params.pagoId as string, 10);
            await repository.removePago(ventaId, pagoId);
            await audit({
                entidad: 'VentaPago',
                accion: 'delete_soft',
                entidadId: pagoId,
                detalle: `Pago ${pagoId} eliminado de venta ${ventaId}`,
            });
            res.status(204).send();
        } catch (error) { next(error); }
    }

    // ----- Sub-recursos: extras -----
    static async listExtras(req: Request, res: Response, next: NextFunction) {
        try {
            const ventaId = parseInt(req.params.id as string, 10);
            res.json(await repository.listExtras(ventaId));
        } catch (error) { next(error); }
    }

    static async addExtra(req: Request, res: Response, next: NextFunction) {
        try {
            const ventaId = parseInt(req.params.id as string, 10);
            const result = await repository.addExtra(ventaId, req.body);
            await audit({
                entidad: 'VentaExtra',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Extra ${(result as any)?.id} agregado a venta ${ventaId}`,
            });
            res.status(201).json(result);
        } catch (error) { next(error); }
    }

    static async removeExtra(req: Request, res: Response, next: NextFunction) {
        try {
            const ventaId = parseInt(req.params.id as string, 10);
            const extraId = parseInt(req.params.extraId as string, 10);
            await repository.removeExtra(ventaId, extraId);
            await audit({
                entidad: 'VentaExtra',
                accion: 'delete_soft',
                entidadId: extraId,
                detalle: `Extra ${extraId} eliminado de venta ${ventaId}`,
            });
            res.status(204).send();
        } catch (error) { next(error); }
    }

    // ----- Sub-recursos: canjes -----
    static async listCanjes(req: Request, res: Response, next: NextFunction) {
        try {
            const ventaId = parseInt(req.params.id as string, 10);
            res.json(await repository.listCanjes(ventaId));
        } catch (error) { next(error); }
    }

    static async addCanje(req: Request, res: Response, next: NextFunction) {
        try {
            const ventaId = parseInt(req.params.id as string, 10);
            const result = await repository.addCanje(ventaId, req.body);
            await audit({
                entidad: 'VentaCanje',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Canje ${(result as any)?.id} agregado a venta ${ventaId}`,
            });
            res.status(201).json(result);
        } catch (error) { next(error); }
    }

    static async removeCanje(req: Request, res: Response, next: NextFunction) {
        try {
            const ventaId = parseInt(req.params.id as string, 10);
            const canjeId = parseInt(req.params.canjeId as string, 10);
            await repository.removeCanje(ventaId, canjeId);
            await audit({
                entidad: 'VentaCanje',
                accion: 'delete_soft',
                entidadId: canjeId,
                detalle: `Canje ${canjeId} eliminado de venta ${ventaId}`,
            });
            res.status(204).send();
        } catch (error) { next(error); }
    }
}
