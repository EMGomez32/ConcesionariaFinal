import { z } from 'zod';

// Schemas de validación de los movimientos de vehículo. El payload autoritativo es
// el DTO real del front (FrontConcesionaria/src/api/vehiculo-movimientos.api.ts).
// z.object descarta claves desconocidas -> corta el mass-assignment: el repositorio
// hace `create({ ...data })` sobre el body crudo, con lo que se podían colar campos
// que el back inyecta o deriva (registradoPorId, desdeSucursalId, concesionariaId).
//
// Reglas de negocio que NO se validan acá a propósito: las resuelve el use-case /
// PrismaVehiculoMovimientoRepository.create con mensajes y códigos propios, y son
// CONDICIONALES según `tipo` (replicarlas en Zod arriesgaría rechazar requests
// válidos del front):
//   - traslado    -> hastaSucursalId obligatorio y distinto a la sucursal de origen
//                    (DEST_REQUERIDO / SAME_SUCURSAL).
//   - preparacion -> proveedorDestinoId obligatorio, debe existir y estar activo
//                    (DESTINO_REQUERIDO / PROVEEDOR_INACTIVO).
//   - retorno     -> sólo movimientos tipo=preparacion pueden marcarse retornados
//                    (NO_PREPARACION).
//
// Campos que NO se declaran porque los inyecta/deriva el back (si vinieran en el
// body, el strip de Zod los descarta): registradoPorId (context.getUser() en el
// use-case CreateMovimiento) y desdeSucursalId + concesionariaId (derivados del
// vehículo dentro del repositorio).

const idField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` }).int(`${label} inválido`).positive(`${label} es obligatorio`);

// FK opcional: 0 / '' / null se interpretan como "sin FK" (undefined), porque el
// form puede inicializar el select en 0. Si viene un id real, se valida positivo.
// Su obligatoriedad es condicional según `tipo` y la resuelve el use-case.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// El front sólo emite estos dos tipos; los demás valores del enum de Prisma
// (ingreso, egreso, asignacion_reserva, liberacion_reserva, otro) no pasan por
// este endpoint. Es opcional: si se omite, el repositorio asume 'traslado'.
const tipoMovimientoEnum = z.enum(['traslado', 'preparacion']);

export const createMovimientoSchema = z.object({
    vehiculoId: idField('El vehículo'),
    tipo: tipoMovimientoEnum.optional(),
    hastaSucursalId: optionalFk,
    proveedorDestinoId: optionalFk,
    motivo: z.string().optional(),
    // El front manda string; el repo lo transforma a Date sólo si viene. No se
    // coerciona a Date acá para no cambiar lo que recibe Prisma.
    fechaMovimiento: z.string().optional(),
});

// PATCH /:id/retorno. El front manda body vacío ({}); el controller lee
// `req.body?.fecha` (string opcional): si no llega, el repo usa new Date(). El
// id viaja por params, no por body.
export const marcarRetornoSchema = z.object({
    fecha: z.string().optional(),
});
