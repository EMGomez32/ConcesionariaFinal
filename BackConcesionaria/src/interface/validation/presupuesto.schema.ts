import { z } from 'zod';

// Schemas de validación del recurso presupuesto. Reemplazan a
// modules/presupuestos/presupuesto.validation.ts (express-validator). Payload
// verificado contra el DTO real del front (presupuestos.api.ts -> CreatePresupuestoDto)
// y el arma-body del form (pages/presupuestos/PresupuestosPage.tsx handleCreate),
// contra lo que consume el repo (PrismaPresupuestoRepository) y el modelo Prisma
// `Presupuesto` + `PresupuestoItem` / `PresupuestoExtra` / `PresupuestoCanje`.
//
// El presupuesto NO tiene vehiculoId ni montoTotal en la tabla: los vehículos van en
// `items`, los adicionales en `externos` y el canje es 1-1 (`canjes`, objeto). El total
// se deriva. La fecha de vencimiento se llama `validoHasta`.
//
// Anti mass-assignment: el repo.create destructura `{ items, externos, canjes, canje,
// ...presupuestoData }` y hace `prisma.presupuesto.create({ data: { ...presupuestoData,
// estado:'borrador', ... } })`. Zod descarta las claves no declaradas, así que
// `presupuestoData` sólo lleva columnas válidas. NO se declara concesionariaId: lo
// inyecta PresupuestoController.create desde el token (context.getTenantId()) DESPUÉS
// del body, no viene del cliente (igual que venta.schema.ts).

const idField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` }).int(`${label} inválido`).positive(`${label} es obligatorio`);

// Monto requerido: equivale al `isDecimal()` del validador viejo (acepta número o
// string numérico, rechaza no-numérico). No se fuerza positivo para no ser más estricto
// que isDecimal. El front siempre manda estos con Number(...).
const decimalField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` });

// Número opcional tolerante ('' / null / NaN -> undefined) para no persistir un 0 espurio.
const optionalInt = z.preprocess(
    (v) => (v === '' || v === null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v),
    z.coerce.number().int().optional(),
);
const optionalDecimal = z.preprocess(
    (v) => (v === '' || v === null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v),
    z.coerce.number().optional(),
);

const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

const monedaEnum = z.enum(['ARS', 'USD']);
// Valores exactos del enum EstadoPresupuesto (prisma/schema.prisma).
const estadoEnum = z.enum(['borrador', 'enviado', 'aceptado', 'rechazado', 'vencido', 'cancelado']);

// Fecha opcional que admite null (el validador viejo usaba optional({ nullable: true })).
// '' -> undefined (omitir); null pasa (el repo lo interpreta como "sin fecha"); una
// fecha string se valida como presente. El repo hace new Date(validoHasta) sólo si es truthy.
const optionalDateNullable = z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().nullable().optional(),
);

// String opcional que admite null (optional({ nullable: true }).isString() del original).
const optionalStrNullable = z.string().nullable().optional();

// Un ítem = una unidad cotizada. vehiculoId + precios son obligatorios (isInt/isDecimal
// sin .optional() en el validador viejo); descuento opcional (Prisma default 0).
const itemSchema = z.object({
    vehiculoId: idField('El vehículo del ítem'),
    precioLista: decimalField('El precio de lista del ítem'),
    descuento: optionalDecimal,
    precioFinal: decimalField('El precio final del ítem'),
});

// Un extra = un adicional facturable (descripción + monto).
const externoSchema = z.object({
    descripcion: z.string({ error: 'La descripción del extra es obligatoria' }).min(1, 'La descripción del extra es obligatoria'),
    monto: decimalField('El monto del extra'),
});

// Canje 1-1 (objeto, no array). Sólo estos campos del DTO son columnas de
// PresupuestoCanje; crearEnInventario (default true) y vehiculoGeneradoId NO se declaran
// a propósito: el front no los manda y declarar vehiculoGeneradoId abriría un vector
// (linkear el canje a un vehículo arbitrario). valorTomado se exige (es NOT NULL en
// Prisma y el DTO lo marca requerido; el form sólo arma `canjes` cuando hay valorTomado).
const canjeSchema = z.object({
    descripcion: z.string().optional(),
    anio: optionalInt,
    km: optionalInt,
    dominio: z.string().optional(),
    valorTomado: decimalField('El valor de canje'),
    observaciones: z.string().optional(),
});

export const createPresupuestoSchema = z.object({
    // El front lo manda siempre; si faltara, CreatePresupuesto lo autogenera
    // (PRES-{YYYY}-{NNN}). Se declara opcional para PERSISTIR el que manda el front
    // (si se strippeara, se ignoraría su número y se autogeneraría uno distinto).
    nroPresupuesto: z.string().optional(),
    sucursalId: idField('La sucursal'),
    clienteId: idField('El cliente'),
    vendedorId: idField('El vendedor'),
    // El validador viejo tenía moneda opcional (Prisma default ARS). El DTO la manda siempre.
    moneda: monedaEnum.optional(),
    fechaCreacion: z.string({ error: 'La fecha de creación es obligatoria' }).min(1, 'La fecha de creación es obligatoria'),
    validoHasta: optionalDateNullable,
    observaciones: optionalStrNullable,
    items: z.array(itemSchema).optional(),
    externos: z.array(externoSchema).optional(),
    // optional({ nullable: true }).isObject() en el original: el repo usa `canjes || canje`.
    canjes: canjeSchema.nullable().optional(),
});

// Update (PATCH). Modela la whitelist del repo.update (CAMPOS = estado, observaciones,
// validoHasta, moneda, pdfUrl, sucursalId, clienteId, vendedorId), todos opcionales. El
// front sólo manda { estado?, observaciones? }, pero el repo puede persistir los demás,
// así que se declaran para no perder esa capacidad (y no ser más estrictos que el
// validador viejo, que no tenía regla para ellos). items/externos/canjes NO se modelan:
// el repo.update no los persiste (se manejan aparte) y el front no los manda en update.
export const updatePresupuestoSchema = z.object({
    estado: estadoEnum.optional(),
    observaciones: optionalStrNullable,
    validoHasta: optionalDateNullable,
    moneda: monedaEnum.optional(),
    pdfUrl: z.string().optional(),
    sucursalId: optionalFk,
    clienteId: optionalFk,
    vendedorId: optionalFk,
});
