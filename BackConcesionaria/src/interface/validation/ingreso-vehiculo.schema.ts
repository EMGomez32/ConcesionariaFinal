import { z } from 'zod';

// Schema de validación del alta de ingresos de vehículo. Payload verificado contra
// el DTO real del front (vehiculo-ingresos.api.ts -> Partial<IngresoVehiculo>) y
// contra lo que consume el repositorio (PrismaIngresoVehiculoRepository.create).
//
// La lista explícita de campos CORTA el mass-assignment: el use-case hace
// `repository.create(req.body)` sin filtrar, y el repo arma el `data` de Prisma con
// `...rest`. Sin este schema se podía colar `concesionariaId`, `id`, `registradoPorId`,
// etc. Zod descarta todo lo no declarado.
//
// NO declaramos `concesionariaId`: el repo lo inyecta desde el vehículo
// (v.concesionariaId) dentro de la transacción, así que declararlo sólo abriría un
// vector cross-tenant. Tampoco `registradoPorId` (el front no lo manda y el controller
// no lo inyecta; hoy persiste null). `id`/`createdAt` se descartan por no declararse.

const idField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` }).int(`${label} inválido`).positive(`${label} es obligatorio`);

// FK opcional: 0 / '' / null se interpretan como "sin FK" (undefined), porque el
// form puede inicializar el campo en 0. Si viene un id real, se valida positivo.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// Monto opcional: 0 / '' / null -> undefined (el repo ya trata 0 como null vía
// `valorTomado ? Number(valorTomado) : null`). Si viene un valor real, se valida
// positivo. Ser tolerante acá evita rechazar un 0 legítimo del form.
const optionalMonto = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().positive('El valor tomado debe ser mayor a 0').optional(),
);

// Valores exactos del enum TipoIngresoVehiculo (prisma/schema.prisma).
const tipoIngresoEnum = z.enum(['compra_proveedor', 'compra_particular', 'permuta', 'consignacion', 'otro']);

export const createIngresoVehiculoSchema = z.object({
    vehiculoId: idField('El vehículo'),
    sucursalId: idField('La sucursal'),
    tipoIngreso: tipoIngresoEnum,
    // El repo hace `new Date(fechaIngreso)`. Se valida como string presente (NO se
    // coacciona a Date para no cambiar lo que recibe el repositorio).
    fechaIngreso: z.string({ error: 'La fecha de ingreso es obligatoria' }).min(1, 'La fecha de ingreso es obligatoria'),
    valorTomado: optionalMonto,
    clienteOrigenId: optionalFk,
    proveedorOrigenId: optionalFk,
    presupuestoId: optionalFk,
    ventaId: optionalFk,
    observaciones: z.string().optional(),
});
