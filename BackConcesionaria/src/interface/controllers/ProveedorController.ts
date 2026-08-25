import { Request, Response, NextFunction } from 'express';
import { PrismaProveedorRepository } from '../../infrastructure/database/repositories/PrismaProveedorRepository';
import { GetProveedores } from '../../application/use-cases/proveedores/GetProveedores';
import { GetProveedorById } from '../../application/use-cases/proveedores/GetProveedorById';
import { CreateProveedor } from '../../application/use-cases/proveedores/CreateProveedor';
import { UpdateProveedor } from '../../application/use-cases/proveedores/UpdateProveedor';
import { DeleteProveedor } from '../../application/use-cases/proveedores/DeleteProveedor';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { actorEsAdmin } from '../../infrastructure/security/roles';

/**
 * La pestaña "Vehículos comprados" del detalle es el único lugar de la app donde el
 * costo de cada unidad se lista en grilla. `GET /proveedores/:id` no tiene authorize
 * (todo el equipo necesita ver a quién se le compra y a quién se le manda un auto al
 * taller), así que el recorte va por rol acá, igual que `sanitizeUsuario` hace con
 * `comisionPorcentaje`: la lista la ve todo el mundo, la columna de plata sólo admin.
 *
 * Es el número que el negocio existe para no mostrar: con la ficha del proveedor
 * abierta, un perfil `lectura` (el contador externo, el socio consignatario) se
 * llevaba la lista completa de compras con lo que se pagó por cada auto.
 */
function sanitizarVehiculosComprados(p: any, esAdmin: boolean) {
    if (esAdmin || !p || typeof p !== 'object' || !Array.isArray(p.vehiculosCompra)) return p;
    return {
        ...p,
        vehiculosCompra: p.vehiculosCompra.map(({ precioCompra, fechaCompra, ...resto }: any) => {
            void precioCompra; void fechaCompra;
            return resto;
        }),
    };
}

const repository = new PrismaProveedorRepository();
const getProveedoresUC = new GetProveedores(repository);
const getProveedorByIdUC = new GetProveedorById(repository);
const createProveedorUC = new CreateProveedor(repository);
const updateProveedorUC = new UpdateProveedor(repository);
const deleteProveedorUC = new DeleteProveedor(repository);

export class ProveedorController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getProveedoresUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getProveedorByIdUC.execute(id);
            res.json(sanitizarVehiculosComprados(result, actorEsAdmin()));
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            const result = await createProveedorUC.execute({ ...req.body, concesionariaId });
            await audit({
                entidad: 'Proveedor',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Proveedor ${(result as any)?.nombre ?? (result as any)?.id} creado`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateProveedorUC.execute(id, req.body);
            await audit({
                entidad: 'Proveedor',
                accion: 'update',
                entidadId: id,
                detalle: `Proveedor ${(result as any)?.nombre ?? id} actualizado`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteProveedorUC.execute(id);
            await audit({
                entidad: 'Proveedor',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Proveedor ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
