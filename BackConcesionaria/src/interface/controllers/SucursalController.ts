import { Request, Response, NextFunction } from 'express';
import { PrismaSucursalRepository } from '../../infrastructure/database/repositories/PrismaSucursalRepository';
import { GetSucursales } from '../../application/use-cases/sucursales/GetSucursales';
import { GetSucursalById } from '../../application/use-cases/sucursales/GetSucursalById';
import { CreateSucursal } from '../../application/use-cases/sucursales/CreateSucursal';
import { UpdateSucursal } from '../../application/use-cases/sucursales/UpdateSucursal';
import { DeleteSucursal } from '../../application/use-cases/sucursales/DeleteSucursal';
import { BaseException } from '../../domain/exceptions/BaseException';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';

const repository = new PrismaSucursalRepository();
const getSucursalesUC = new GetSucursales(repository);
const getSucursalByIdUC = new GetSucursalById(repository);
const createSucursalUC = new CreateSucursal(repository);
const updateSucursalUC = new UpdateSucursal(repository);
const deleteSucursalUC = new DeleteSucursal(repository);

/** El id de la URL: si no es un entero, 400 en vez del 500 que da Prisma con NaN. */
function parseId(raw: string): number {
    const id = parseInt(raw, 10);
    if (!Number.isInteger(id) || id < 1) {
        throw new BaseException(400, 'Id de sucursal inválido', 'VALIDATION_ERROR');
    }
    return id;
}

export class SucursalController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getSucursalesUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await getSucursalByIdUC.execute(parseId(req.params.id as string));
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const actor = context.getUser();
            const isSuper = actor?.roles?.includes('super_admin');
            // A qué concesionaria pertenece la sucursal:
            //  - super_admin: la que eligió en el form (puede crear para cualquier tenant).
            //  - admin: siempre la suya (se ignora el body → sin fuga cross-tenant).
            // El RLS inyecta concesionariaId para el admin, pero NO para super_admin,
            // así que acá lo resolvemos explícito para que el super_admin también pueda crear.
            const concesionariaId = isSuper
                ? (req.body?.concesionariaId != null ? Number(req.body.concesionariaId) : null)
                : (actor?.concesionariaId ?? null);
            const result = await createSucursalUC.execute({ ...req.body, concesionariaId });
            await audit({
                entidad: 'Sucursal',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Sucursal "${(result as any)?.nombre ?? (result as any)?.id}" creada`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseId(req.params.id as string);
            const result = await updateSucursalUC.execute(id, req.body);
            await audit({
                entidad: 'Sucursal',
                accion: 'update',
                entidadId: id,
                detalle: `Sucursal ${id} actualizada`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseId(req.params.id as string);
            await deleteSucursalUC.execute(id);
            await audit({
                entidad: 'Sucursal',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Sucursal ${id} eliminada`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
