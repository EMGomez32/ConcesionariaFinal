import { z } from 'zod';

// Schemas de validación de solicitudes de financiación. Migración de
// modules/financiacion-solicitudes/solicitud.validation.ts (express-validator).
// Payloads verificados contra el DTO real del front (solicitudesFinanciacion.api.ts:
// CreateSolicitudDto / UpdateSolicitudDto) y el form (FinanciacionExternaPage.tsx).
//
// IMPORTANTE (anti-regresión): el repo (PrismaSolicitudFinanciacionRepository)
// persiste en UPDATE campos que el validation viejo NO validaba: sucursalId,
// ventaId y presupuestoId (UPDATABLE). Como Zod DESCARTA lo no declarado, hay que
// declararlos igual, si no se perdería la capacidad de reasignarlos que hoy existe.
// Y UpdateSolicitud (use-case) los lee para el guard de tenant (assertMismoTenant).
//
// `estado` NO se declara en create: el default del schema es 'borrador' y la
// máquina de estados (UpdateSolicitud) asume ese punto de partida; aceptarlo en el
// alta permitiría crear una solicitud ya 'aprobada' salteándose las transiciones
// (el repo tampoco lo tiene en CREATABLE).

// Enum EstadoSolicitudFinanciacion (prisma/schema.prisma).
const estadoEnum = z.enum(
    ['borrador', 'enviada', 'pendiente', 'aprobada', 'rechazada', 'cancelada'],
    { error: 'Estado inválido. Válidos: borrador, enviada, pendiente, aprobada, rechazada, cancelada' },
);

// Entero obligatorio (FK requerida): isInt({ min: 1 }).
const requiredId = (msg: string) =>
    z.coerce.number({ error: msg }).int(msg).positive(msg);

// FK opcional que PRESERVA null (permite des-asignar en la edición; el repo lo
// persiste). isInt({ min: 1 }) => entero positivo. Sólo '' se colapsa a undefined.
const nullableInt = (msg?: string) => {
    const base = msg
        ? z.coerce.number({ error: msg }).int(msg).positive(msg)
        : z.coerce.number().int().positive();
    return z.preprocess((v) => (v === '' ? undefined : v), base.nullable().optional());
};

// Importe opcional >= 0 (isFloat({ min: 0 })): acepta decimales y 0, rechaza
// negativos. Preserva null.
const nullableMonto = (msg?: string) => {
    const base = msg
        ? z.coerce.number({ error: msg }).min(0, msg)
        : z.coerce.number().min(0);
    return z.preprocess((v) => (v === '' ? undefined : v), base.nullable().optional());
};

// Fecha nullable: el repo hace `new Date(x)` salvo null. Se valida como string
// (el front manda ISO: 'YYYY-MM-DD' o toISOString()); Prisma/el repo convierten.
const nullableFecha = () =>
    z.preprocess((v) => (v === '' ? undefined : v), z.string().nullable().optional());

const nullableString = () =>
    z.preprocess((v) => (v === '' ? undefined : v), z.string().nullable().optional());

// concesionariaId: lo resuelve el controller (resolveConcesionariaId) y el
// super_admin lo elige por body → debe SOBREVIVIR al strip de validate.middleware.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

export const createSolicitudSchema = z.object({
    clienteId: requiredId('clienteId es obligatorio'),
    financieraId: requiredId('financieraId es obligatorio'),
    sucursalId: nullableInt(),
    ventaId: nullableInt(),
    presupuestoId: nullableInt(),
    // Opcional: en una pre-aprobación crediticia todavía no hay auto elegido.
    vehiculoId: nullableInt('vehiculoId inválido'),
    montoSolicitado: nullableMonto('El monto solicitado no puede ser negativo'),
    plazoCuotas: nullableInt('El plazo debe ser de al menos 1 cuota'),
    tasaEstimada: nullableMonto('La tasa no puede ser negativa'),
    observaciones: nullableString(),
    concesionariaId: optionalFk,
});

// PATCH parcial. Se declaran también sucursalId/ventaId/presupuestoId aunque el
// front tipado no los mande y el validation viejo no los validara: el repo los
// persiste (UPDATABLE) y el use-case los usa para el guard de tenant. Omitirlos
// haría que Zod los descarte => se perdería la reasignación (REGRESIÓN).
export const updateSolicitudSchema = z.object({
    estado: estadoEnum.optional(),
    sucursalId: nullableInt(),
    ventaId: nullableInt(),
    presupuestoId: nullableInt(),
    vehiculoId: nullableInt('vehiculoId inválido'),
    montoSolicitado: nullableMonto(),
    plazoCuotas: nullableInt(),
    tasaEstimada: nullableMonto(),
    montoAprobado: nullableMonto('El monto aprobado no puede ser negativo'),
    tasaFinal: nullableMonto('La tasa final no puede ser negativa'),
    fechaEnvio: nullableFecha(),
    fechaRespuesta: nullableFecha(),
    observaciones: nullableString(),
});
