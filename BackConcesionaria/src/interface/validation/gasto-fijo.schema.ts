import { z } from 'zod';

// Schemas de validación de gastos fijos. Migración 1:1 de
// modules/gastos-fijos/gasto-fijo.validation.ts (express-validator). Payloads
// verificados contra el DTO real del front (gastos-fijos.api.ts) y el form
// (GastosFijosPage.tsx). Se modelan TODOS los campos que el repo persiste
// (PrismaGastoFijoRepository.EDITABLE): sucursalId, categoriaId, proveedorId,
// anio, mes, descripcion, monto, moneda, comprobanteUrl. Zod descarta lo no
// declarado => corta el mass-assignment (nadie cuela id/deletedAt/etc.).

// Entero obligatorio (FK requerida). Mismo criterio que idField de venta.schema:
// un id <= 0 nunca es una FK válida. Un solo mensaje por campo, como el
// `withMessage` de express-validator.
const requiredId = (msg: string) =>
    z.coerce.number({ error: msg }).int(msg).positive(msg);

// FK opcional que PRESERVA null. OJO: distinto del optionalFk de venta.schema.
// El form de edición manda `sucursalId: x ? Number(x) : null` (y lo mismo para
// proveedorId/comprobanteUrl) para LIMPIAR el campo, y el repo persiste ese null.
// Si colapsáramos null → undefined (como hace venta), pickEditable lo saltearía y
// no se podría vaciar el campo en la edición → REGRESIÓN. Sólo '' se trata como
// ausente (checkFalsy de express-validator).
const nullableInt = () =>
    z.preprocess(
        (v) => (v === '' ? undefined : v),
        z.coerce.number().int().positive().nullable().optional(),
    );

const nullableString = () =>
    z.preprocess(
        (v) => (v === '' ? undefined : v),
        z.string().nullable().optional(),
    );

// concesionariaId lo resuelve el controller (resolveConcesionariaId) desde el
// token para un admin, y el super_admin lo elige POR BODY. Como validate.middleware
// hace `req.body = result.data`, si no se declarara acá el super_admin perdería su
// elección y el repo tiraría "Argument `concesionaria` is missing" (500). Mismo
// reparto que usuario.schema.ts. 0/''/null => undefined (no es un campo que se
// "limpie": o viene un tenant real o no viene).
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

export const createGastoFijoSchema = z.object({
    categoriaId: requiredId('categoriaId debe ser un entero'),
    sucursalId: nullableInt(),
    proveedorId: nullableInt(),
    anio: z.coerce
        .number({ error: 'anio debe ser un entero válido' })
        .int('anio debe ser un entero válido')
        .min(2000, 'anio debe ser un entero válido'),
    mes: z.coerce
        .number({ error: 'mes debe estar entre 1 y 12' })
        .int('mes debe estar entre 1 y 12')
        .min(1, 'mes debe estar entre 1 y 12')
        .max(12, 'mes debe estar entre 1 y 12'),
    // isDecimal() no tenía min: NO se agrega .positive() para no rechazar montos
    // que hoy pasan (mantener la laxitud de express-validator).
    monto: z.coerce.number({ error: 'monto debe ser un número' }),
    moneda: z.enum(['ARS', 'USD'], { error: 'moneda debe ser ARS o USD' }).optional(),
    descripcion: z.string({ error: 'descripcion es obligatoria' }).min(1, 'descripcion es obligatoria'),
    comprobanteUrl: nullableString(),
    concesionariaId: optionalFk,
});

// Todos opcionales (PATCH parcial). No se declara concesionariaId: el
// controller.update no lo resuelve y el repo no lo tiene en EDITABLE, así que
// nunca se reasigna el tenant por esta vía.
export const updateGastoFijoSchema = z.object({
    categoriaId: z.coerce.number().int().positive().optional(),
    sucursalId: nullableInt(),
    proveedorId: nullableInt(),
    anio: z.coerce.number().int().min(2000).optional(),
    mes: z.coerce.number().int().min(1).max(12).optional(),
    monto: z.coerce.number().optional(),
    moneda: z.enum(['ARS', 'USD'], { error: 'moneda debe ser ARS o USD' }).optional(),
    descripcion: z.string().min(1, 'descripcion no puede quedar vacía').optional(),
    comprobanteUrl: nullableString(),
});
