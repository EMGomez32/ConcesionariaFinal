import { z } from 'zod';

// Schemas de validación del recurso vehículo. Reemplazan a
// modules/vehiculos/vehiculo.validation.ts (express-validator). Payload verificado
// contra el DTO real del front (vehiculos.api.ts -> Partial<Vehiculo> de
// types/vehiculo.types.ts), el form (pages/vehiculos/VehiculoFormPage.tsx), el
// @openapi de la ruta y el modelo Prisma `Vehiculo`.
//
// CRÍTICO — anti mass-assignment: PrismaVehiculoRepository.create y .update hacen
// `prisma.vehiculo.create/update({ data })` con el body CRUDO, SIN whitelist
// (no hay pickEditable como en sucursal/presupuesto). Con express-validator (que
// no descarta claves) eso ya era un riesgo latente; con Zod este schema pasa a ser
// el ÚNICO filtro. De ahí las dos reglas:
//   1) Declarar TODOS los campos persistibles que el form puede mandar. Si falta
//      uno, el strip lo borra y NO se guarda => regresión.
//   2) NO declarar ningún campo que no sea columna de `Vehiculo` (salvo los que el
//      use-case consume y separa). Si sobra uno, Prisma tira 500.
//
// clienteOrigenId NO es columna del vehículo: CreateVehiculo/UpdateVehiculo lo
// separan del resto (`const { clienteOrigenId, ...vehiculoData } = data`) y lo usan
// para registrar el IngresoVehiculo. Hay que declararlo igual o el ingreso perdería
// el cliente de origen.

// Enums espejados de prisma/schema.prisma (mismo estilo que venta.schema.ts:
// z.enum pelado, sin mensaje custom). No ampliar sin tocar el enum de Prisma.
const tipoEnum = z.enum(['USADO', 'CERO_KM']);
const origenEnum = z.enum(['compra', 'permuta', 'consignacion', 'otro']);
const estadoEnum = z.enum(['preparacion', 'publicado', 'reservado', 'vendido', 'devuelto']);
const monedaEnum = z.enum(['ARS', 'USD']);

const idField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` }).int(`${label} inválido`).positive(`${label} es obligatorio`);

// FK opcional: 0 / '' / null -> "sin FK" (undefined). Los selects de proveedor y
// cliente del form mandan string ('' = "— Ninguno —"). Mismo patrón que
// venta.schema.ts / ingreso-vehiculo.schema.ts. El use-case ya trata undefined/null
// como null antes de Prisma.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// Número opcional tolerante: el form usa `valueAsNumber` en los inputs numéricos
// (anio, kmIngreso, precioLista, precioCompra); un campo vacío llega como NaN y JSON
// lo serializa a null. '' / null / NaN se interpretan como "sin dato" (undefined)
// para NO persistir un 0 espurio (un coerce crudo haría Number(null) === 0). Un
// valor real se coacciona a número. Ser tolerante NO rechaza nada que hoy pase.
const optionalInt = z.preprocess(
    (v) => (v === '' || v === null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v),
    z.coerce.number().int().optional(),
);
const optionalDecimal = z.preprocess(
    (v) => (v === '' || v === null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v),
    z.coerce.number().optional(),
);

// String opcional: se deja pasar '' TAL CUAL (no se mapea a undefined). El repo hace
// un create/update crudo, así que hoy un '' se persiste como '' (p.ej. dominio, vin):
// convertirlo a undefined cambiaría ese comportamiento. Igual que en ingreso-vehiculo.
const optionalStr = z.string().optional();

export const createVehiculoSchema = z.object({
    // Requeridos (equivalen a los isInt / notEmpty / isIn / isISO8601 SIN .optional()
    // del validador original).
    sucursalId: idField('La sucursal'),
    marca: z.string({ error: 'La marca es obligatoria' }).min(1, 'La marca es obligatoria'),
    modelo: z.string({ error: 'El modelo es obligatorio' }).min(1, 'El modelo es obligatorio'),
    tipo: tipoEnum,
    origen: origenEnum,
    // isISO8601 en el original; se replica laxo (string presente) igual que fechaVenta
    // en venta.schema.ts. El use-case hace new Date(fechaIngreso); no se coacciona a
    // Date acá para no cambiar lo que recibe el use-case.
    fechaIngreso: z.string({ error: 'La fecha de ingreso es obligatoria' }).min(1, 'La fecha de ingreso es obligatoria'),

    // Opcionales persistidos por el repo (todo lo que puede mandar el form + la
    // relectura en edición). Modelarlos evita que el strip los borre.
    estado: estadoEnum.optional(),
    version: optionalStr,
    anio: optionalInt,
    dominio: optionalStr,
    vin: optionalStr,
    kmIngreso: optionalInt,
    color: optionalStr,
    fechaCompra: optionalStr,
    moneda: monedaEnum.optional(),
    precioLista: optionalDecimal,
    precioCompra: optionalDecimal,
    proveedorCompraId: optionalFk,
    formaPagoCompra: optionalStr,
    observaciones: optionalStr,

    // Dato del INGRESO, no del vehículo: el use-case lo separa y lo consume. Debe
    // sobrevivir al strip.
    clienteOrigenId: optionalFk,

    // Para un admin lo inyecta la RLS; para super_admin viene por body y
    // resolveTenantDestino(vehiculoData.concesionariaId) lo lee para saber en qué
    // concesionaria crear. Debe sobrevivir al strip o super_admin no podría crear en
    // la concesionaria elegida (mismo contrato que usuario/sucursal, commit #8).
    concesionariaId: optionalFk,
});

// Update (PATCH): el form de edición es el MISMO que el de alta y reenvía todos los
// campos (react-hook-form + reset), por lo que hay que aceptarlos todos, pero TODOS
// opcionales. El repo tampoco tiene whitelist en update, así que este schema vuelve a
// ser el único filtro: Zod strippea id / createdAt / updatedAt / sucursal / archivos /
// movimientos que la relectura arrastra (y que hoy, sin strip, llegarían crudos).
//
// Se OMITE concesionariaId a propósito: UpdateVehiculo usa exists.concesionariaId y
// nunca reasigna tenant. Dejarlo fuera hace que el strip lo descarte y evita un
// movimiento cross-tenant armando un PATCH a mano.
export const updateVehiculoSchema = z.object({
    sucursalId: optionalFk,
    marca: z.string().min(1, 'La marca no puede estar vacía').optional(),
    modelo: z.string().min(1, 'El modelo no puede estar vacío').optional(),
    tipo: tipoEnum.optional(),
    origen: origenEnum.optional(),
    estado: estadoEnum.optional(),
    version: optionalStr,
    anio: optionalInt,
    dominio: optionalStr,
    vin: optionalStr,
    kmIngreso: optionalInt,
    color: optionalStr,
    fechaIngreso: optionalStr,
    fechaCompra: optionalStr,
    moneda: monedaEnum.optional(),
    precioLista: optionalDecimal,
    precioCompra: optionalDecimal,
    proveedorCompraId: optionalFk,
    formaPagoCompra: optionalStr,
    observaciones: optionalStr,
    clienteOrigenId: optionalFk,
});
