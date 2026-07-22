import { z } from 'zod';

// Schemas de validación de gastos vehiculares. Payloads verificados contra los
// DTOs reales del front (gastos.api.ts) y contra los DOS formularios que los
// disparan (GastosPage.tsx y VehiculoDetallePage.tsx). El controller pasa el
// body CRUDO al use-case -> repo, así que esta lista explícita de campos es lo
// que CORTA el mass-assignment (Zod descarta todo lo no declarado).
//
// Ojo con dos traducciones que hace PrismaGastoRepository:
//   - `fechaGasto` (lo que manda el front) se persiste en la columna `fecha`. El
//     repo lee `data.fecha ?? data.fechaGasto`, por eso el schema CONSERVA
//     `fechaGasto` tal cual y NO lo coerciona a Date (el repo hace `new Date()`).
//   - `tipo` ('VEHICULO'/'FIJO') lo manda el front pero el repo lo IGNORA por
//     completo; se acepta sólo para no rechazar el payload real.
//
// `concesionariaId` NO se valida ni se acepta: lo inyecta la extensión RLS de
// Prisma en el create (nadie puede colarlo desde el body). `sucursalId` es
// derivado del vehículo y no es columna de este modelo: tampoco se modela.

const idField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` }).int(`${label} inválido`).positive(`${label} es obligatorio`);

const montoField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` }).positive(`${label} debe ser mayor a 0`);

// FK opcional: 0 / '' / null se interpretan como "sin FK" (undefined), porque el
// form puede inicializar el campo en 0/''. Si viene un id real, se valida positivo.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

const monedaEnum = z.enum(['ARS', 'USD']);
const tipoGastoEnum = z.enum(['VEHICULO', 'FIJO']);

// POST /gastos. Campos autoritativos del front: vehiculoId, categoriaId, monto,
// moneda, fechaGasto, descripcion, tipo (ver gastos.api.ts + los dos forms).
// `moneda` se deja opcional porque el repo ya defaultea a 'ARS' (aunque el front
// siempre la manda). `fecha`/`comprobanteUrl`/`urlComprobante` los lee el repo
// como alternativas de traducción: se declaran opcionales para que el strip no
// los borre si el front los agrega en el futuro (hoy no los manda).
export const createGastoSchema = z.object({
    vehiculoId: idField('El vehículo'),
    categoriaId: idField('La categoría'),
    monto: montoField('El monto'),
    moneda: monedaEnum.optional(),
    fechaGasto: z.string({ error: 'La fecha del gasto es obligatoria' }).min(1, 'La fecha del gasto es obligatoria'),
    descripcion: z.string().optional(),
    proveedorId: optionalFk,
    tipo: tipoGastoEnum.optional(),
    fecha: z.string().min(1, 'La fecha del gasto no puede estar vacía').optional(),
    comprobanteUrl: z.string().optional(),
    urlComprobante: z.string().optional(),
});

// PATCH /gastos/:id. El DTO tipado del front sólo permite { monto, descripcion,
// fechaGasto } (gastos.api.ts / useGastos.ts). Se modela exactamente eso, más
// `fecha` (la clave alternativa que el repo prioriza). Intencionalmente NO se
// aceptan categoriaId/proveedorId/moneda/comprobante en el update: el front
// tipado no puede mandarlos y dejarlos afuera corta el mass-assignment (mismo
// criterio que updateVentaSchema). El repo igual los soporta si más adelante se
// decide ampliar el DTO del front.
export const updateGastoSchema = z.object({
    monto: montoField('El monto').optional(),
    descripcion: z.string().optional(),
    fechaGasto: z.string().min(1, 'La fecha del gasto no puede estar vacía').optional(),
    fecha: z.string().min(1, 'La fecha del gasto no puede estar vacía').optional(),
});
