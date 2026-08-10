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

// Cantidad de cuotas: entero entre 1 y 600 (el use-case/repositorio hace parseInt).
// El tope NO es cosmético: `planDeCuotas` corre un loop síncrono de n iteraciones
// (crea n objetos + n cálculos de fecha) y lo comparten create/refinanciar/simular.
// Sin cota, un `cuotas: 1e8` cuelga el event loop / tumba el proceso por OOM (peor
// en la Raspberry Pi de prod). 600 = 50 años de cuotas mensuales, muy por encima de
// cualquier financiación real (el front ofrece hasta 60).
const cuotasField = z.coerce.number({ error: 'La cantidad de cuotas es obligatoria' })
    .int('La cantidad de cuotas debe ser un número entero')
    .min(1, 'La cantidad de cuotas debe ser al menos 1')
    .max(600, 'La cantidad de cuotas no puede superar 600');

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

// POST /financiaciones/simular — calcula el plan de cuotas SIN persistir (herramienta
// de venta). Sólo los inputs de la matemática: monto y cuotas obligatorios; tasa,
// moneda, fecha y día opcionales (fecha/día sólo afectan las FECHAS de vencimiento,
// no los montos, así que se defaultan en el controller para simular rápido).
export const simularFinanciacionSchema = z.object({
    montoFinanciado: montoField('El monto a financiar'),
    cuotas: cuotasField,
    tasaMensual: optionalTasa,
    moneda: monedaEnum.optional(),
    fechaInicio: z.string().optional(),
    diaVencimiento: optionalDiaVencimiento,
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
// `referencia` y `observaciones` son parte del DTO pero RegistrarPagoCuota sólo
// persiste monto/metodo/fechaPago/idempotencyKey; los demás se aceptan y se ignoran.
// `idempotencyKey`: clave que el front genera al abrir el modal de cobro; el
// backend la usa para no duplicar el pago ante reenvíos (doble-submit / retry).
export const pagarCuotaSchema = z.object({
    monto: montoField('El monto del pago'),
    metodo: metodoPagoEnum,
    referencia: z.string().optional(),
    observaciones: z.string().optional(),
    // Fecha parseable: sin esto un string basura llega a new Date() y explota como
    // 500 en el create (en vez de un 400 de validación).
    fechaPago: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha de pago inválida').optional(),
    // REQUERIDA: la idempotencia de un endpoint de dinero no puede ser opcional.
    // El front genera un UUID por apertura de modal; sin clave no hay dedupe de
    // reenvíos, así que se exige a todo caller.
    idempotencyKey: z.string().min(8).max(64),
});
