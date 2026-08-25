import { Request, Response, NextFunction } from 'express';
import { PrismaIngresoVehiculoRepository } from '../../infrastructure/database/repositories/PrismaIngresoVehiculoRepository';
import { GetIngresosVehiculo } from '../../application/use-cases/vehiculo-ingresos/GetIngresosVehiculo';
import { GetIngresoVehiculoById } from '../../application/use-cases/vehiculo-ingresos/GetIngresoVehiculoById';
import { CreateIngresoVehiculo } from '../../application/use-cases/vehiculo-ingresos/CreateIngresoVehiculo';
import { DeleteIngresoVehiculo } from '../../application/use-cases/vehiculo-ingresos/DeleteIngresoVehiculo';
import { audit } from '../../infrastructure/security/audit';
import { actorTieneRol } from '../../infrastructure/security/roles';

// En un ingreso `compra_proveedor`, `valorTomado` ES el precio de compra de la
// unidad: sale del mismo campo del alta del vehículo. Dejarlo abierto convertía a
// `GET /vehiculo-ingresos` en el reporte de rentabilidad por la ventana de atrás —
// se cruza con el `precioVenta` de `GET /ventas` por vehiculoId y sale el margen
// unidad por unidad, que es justo lo que `/reportes/rentabilidad` reserva a admin.
//
// No se cierra la ruta entera con authorize: el listado de ingresos es una consulta
// legítima de `lectura` y de postventa (qué entró, cuándo, de quién, a qué sucursal)
// y cerrarlo les rompe la pantalla. Se recorta el importe, igual que
// ProveedorController hace con precioCompra y UsuarioController con comisionPorcentaje.
// admin+vendedor porque es el mismo par que ya puede exportar el CSV de vehículos y
// el vendedor es quien carga el valor.
function sanitizarValorTomado<T>(ingreso: T, veElImporte: boolean): T {
    if (veElImporte || !ingreso || typeof ingreso !== 'object') return ingreso;
    const { valorTomado, ...resto } = ingreso as any;
    void valorTomado;
    return resto as T;
}

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

            const result: any = await getIngresosUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            const veElImporte = actorTieneRol('admin', 'vendedor');
            res.json({ ...result, results: (result.results ?? []).map((i: any) => sanitizarValorTomado(i, veElImporte)) });
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getByIdUC.execute(id);
            res.json(sanitizarValorTomado(result, actorTieneRol('admin', 'vendedor')));
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
