import { z } from 'zod';

// Schemas de validación de financiaciones. Payloads verificados contra los DTOs
// reales del front (financiaciones.api.ts: CreateFinanciacionDto, PagarCuotaDto y
// el objeto inline de `refinanciar`). Se usa `coerce` para aceptar tanto números
// como strings numéricos sin romper, y la lista explícita de campos CORTA el
// mass-assignment: los use-cases pasan el body crudo a Prisma (CreateFinanciacion
// hace `repository.create(req.body)` y UpdateFinanciacion `repository.update(id,
// data)`, que a su vez hace `prisma.update({ data })`), con lo que sin esta capa
// se podría inyectar estado/id/concesionariaId/montoFinanciado, etc. Zod descarta
// todo lo no declarado.
//
// TENANT: el controller resuelve el tenant (body para super_admin, token para el
// resto). Para el NO super_admin lo inyecta además la extensión de Prisma
// (prisma.extension.ts); para super_admin NO, así que `concesionariaId` se declara
// acá (opcional) para que sobreviva al strip de Zod y el super_admin pueda elegir
// tenant por body. `sucursalId` es opcional en el modelo y el front no lo envía en
// el create.

const idField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` }).int(`${label} inválido`).positive(`${label} es obligatorio`);

const montoField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` }).positive(`${label} debe ser mayor a 0`);

// FK opcional: 0 / '' / null se interpretan como "sin FK" (undefined), porque el
// form puede inicializar el campo (cobradorId) en 0. Si viene un id real, se
// valida positivo.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// Tasa mensual opcional: '' / null se tratan como "sin tasa" (undefined), igual
// que hacen el use-case y el repositorio (`tasaMensual !== '' && !== null`). Se
// admite 0 (sin interés → cuotas prorrateadas). No puede ser negativa.
const optionalTasa = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().min(0, 'La tasa mensual no puede ser negativa').optional(),
);

// Día de vencimiento opcional (refinanciar): 1..31, mismo rango que valida a mano
// RefinanciarFinanciacion. '' / null → sin dato (undefined): el backend hereda el
// del contrato original.
const optionalDiaVencimiento = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number()
        .int('El día de vencimiento debe ser un número entero')
        .min(1, 'El día de vencimiento debe estar entre 1 y 31')
        .max(31, 'El día de vencimiento debe estar entre 1 y 31')
        .optional(),
);

// Cantidad de cuotas: entero >= 1 (el use-case/repositorio hace parseInt).
const cuotasField = z.coerce.number({ error: 'La cantidad de cuotas es obligatoria' })
    .int('La cantidad de cuotas debe ser un número entero')
    .min(1, 'La cantidad de cuotas debe ser al menos 1');

const monedaEnum = z.enum(['ARS', 'USD']);
const estadoFinanciacionEnum = z.enum(['activa', 'cancelada', 'en_mora', 'refinanciada']);
const metodoPagoEnum = z.enum(['efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro']);

// POST /financiaciones — crea el contrato y genera el plan de cuotas.
export const createFinanciacionSchema = z.object({
    ventaId: idField('La venta'),
    clienteId: idField('El cliente'),
    cobradorId: optionalFk,
    fechaInicio: z.string({ error: 'La fecha de inicio es obligatoria' }).min(1, 'La fecha de inicio es obligatoria'),
    montoFinanciado: montoField('El monto financiado'),
    moneda: monedaEnum.optional(),
    cuotas: cuotasField,
    diaVencimiento: z.coerce.number({ error: 'El día de vencimiento es obligatorio' })
        .int('El día de vencimiento debe ser un número entero')
        .min(1, 'El día de vencimiento debe estar entre 1 y 31')
        .max(31, 'El día de vencimiento debe estar entre 1 y 31'),
    tasaMensual: optionalTasa,
    observaciones: z.string().optional(),
    // Lo resuelve el controller; declarado para que el super_admin pueda elegir
    // tenant por body sin que el strip de Zod lo borre (ver cabecera TENANT).
    concesionariaId: optionalFk,
});

// POST /financiaciones/:id/refinanciar — el monto NO se recibe: el backend lo
// deriva del saldo real de las cuotas impagas. Sólo se refinancian los términos.
// El use-case (RefinanciarFinanciacion) sigue validando el estado del contrato y
// que no haya sido ya refinanciado.
export const refinanciarFinanciacionSchema = z.object({
    cuotas: cuotasField,
    fechaInicio: z.string().optional(),
    tasaMensual: optionalTasa,
    diaVencimiento: optionalDiaVencimiento,
    cobradorId: optionalFk,
    observaciones: z.string().optional(),
});

// PATCH /financiaciones/:id — sólo `estado` y `observaciones` son editables. Todo
// lo demás (monto, cuotas, ventaId, tenant, id...) se descarta: el repo pasa
// `data` tal cual a prisma.update, así que esta lista es la única barrera anti
// mass-assignment. La validez de la TRANSICIÓN de estado la sigue chequeando
// UpdateFinanciacion (assertValidTransition). El front sólo manda `{ estado }`;
// ambos campos van opcionales para no romper un PATCH parcial.
export const updateFinanciacionSchema = z.object({
    estado: estadoFinanciacionEnum.optional(),
    observaciones: z.string().optional(),
});

// PATCH /financiaciones/cuotas/:cuotaId/pagar — registrar pago de cuota.
// OJO: el flujo de pago está DESHABILITADO en el front (FinanciacionesPage.tsx,
// handlePagarCuota corta con un `return` antes de llamar a la API), pero la ruta
// del backend sigue viva y sin validar, así que se cubre igual. `referencia` y
// `observaciones` son parte del DTO pero RegistrarPagoCuota sólo persiste
// monto/metodo/fechaPago; se aceptan y el use-case los ignora.
export const pagarCuotaSchema = z.object({
    monto: montoField('El monto del pago'),
    metodo: metodoPagoEnum,
    referencia: z.string().optional(),
    observaciones: z.string().optional(),
    fechaPago: z.string().optional(),
});
