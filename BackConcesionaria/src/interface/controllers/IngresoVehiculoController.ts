import { Request, Response, NextFunction } from 'express';
import { PrismaIngresoVehiculoRepository } from '../../infrastructure/database/repositories/PrismaIngresoVehiculoRepository';
import { GetIngresosVehiculo } from '../../application/use-cases/vehiculo-ingresos/GetIngresosVehiculo';
import { GetIngresoVehiculoById } from '../../application/use-cases/vehiculo-ingresos/GetIngresoVehiculoById';
import { CreateIngresoVehiculo } from '../../application/use-cases/vehiculo-ingresos/CreateIngresoVehiculo';
import { DeleteIngresoVehiculo } from '../../application/use-cases/vehiculo-ingresos/DeleteIngresoVehiculo';
import { audit } from '../../infrastructure/security/audit';
import { actorEsAdmin, actorTieneRol, actorUserId } from '../../infrastructure/security/roles';

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
//
// CORRECCIÓN (criterio de aceptación 7): el `admin + vendedor` original describía
// el ataque y después dejaba al vendedor adentro, con el argumento de que "es
// quien carga el valor". Cargar un valor y poder leer el de TODO el stock no son
// lo mismo: con el listado abierto, un vendedor barría los ingresos
// `compra_proveedor` —que son literalmente el precio de compra de la unidad— y
// reconstruía el margen del inventario entero.
//
// La regla ahora distingue las dos cosas:
//   - ADMIN: ve todos los importes.
//   - VENDEDOR: ve el importe SÓLO de los ingresos que registró él mismo y SÓLO
//     de los que se negocian en el mostrador (`permuta` / `compra_particular`).
//     Es plata que él mismo acordó con el cliente y ya conoce: ocultársela no
//     protege nada y le rompe la pantalla de la permuta que acaba de tomar.
//   - Nunca, para nadie más: `compra_proveedor` y `consignacion` son la compra
//     mayorista del stock y quedan del lado de administración, sin excepción.
const TIPOS_DE_MOSTRADOR = ['permuta', 'compra_particular'];

function puedeVerImporte(ingreso: any): boolean {
    if (actorEsAdmin()) return true;
    if (!actorTieneRol('vendedor')) return false;
    if (!TIPOS_DE_MOSTRADOR.includes(String(ingreso?.tipoIngreso))) return false;
    // `registradoPorId` es nullable (ingresos viejos, o creados por un job): sin
    // autor conocido no se puede afirmar que sea propio, así que no se muestra.
    const propio = ingreso?.registradoPorId;
    return Boolean(propio) && Number(propio) === actorUserId();
}

function sanitizarValorTomado<T>(ingreso: T): T {
    if (!ingreso || typeof ingreso !== 'object') return ingreso;
    if (puedeVerImporte(ingreso)) return ingreso;
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
            res.json({ ...result, results: (result.results ?? []).map((i: any) => sanitizarValorTomado(i)) });
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getByIdUC.execute(id);
            res.json(sanitizarValorTomado(result));
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
            res.status(201).json(sanitizarValorTomado(result));
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
