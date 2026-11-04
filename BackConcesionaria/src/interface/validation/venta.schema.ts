import { z } from 'zod';
import { obligatorio, invalido } from './mensajes';
import { bodyOVacio, motivoObligatorio, motivoOpcional } from './motivo';

// Schemas de validación de ventas. Payloads verificados contra los DTOs reales
// del front (ventas.api.ts, VentaSubResources.tsx). Se usa `coerce` para aceptar
// tanto números como strings numéricos sin romper, y la lista explícita de campos
// CORTA el mass-assignment: el use-case hacía `...ventaData` sobre el body crudo,
// con lo que se podía inyectar estadoEntrega/id/concesionariaId. Zod descarta todo
// lo no declarado.

const idField = (label: string) =>
    z.coerce.number({ error: obligatorio(label) }).int(invalido(label)).positive(obligatorio(label));

const montoField = (label: string) =>
    z.coerce.number({ error: obligatorio(label) }).positive(`${label} debe ser mayor a 0`);

// FK opcional: 0 / '' / null se interpretan como "sin FK" (undefined), porque el
// form puede inicializar el campo en 0. Si viene un id real, se valida positivo.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// Fecha que el use-case pasa DIRECTO a Prisma (`...ventaData` / `...data` en el
// create). El front la manda desde un <input type="date"> como "YYYY-MM-DD", y
// Prisma rechaza ese string para un DateTime ("Expected ISO-8601 DateTime") → 500
// al registrar la venta, al convertir un presupuesto y al agregar un pago. Se
// valida y se convierte acá, con la misma convención que el resto del backend
// (`new Date("YYYY-MM-DD")` = medianoche UTC, ver RegistrarPagoCuota). También
// acepta un ISO completo, que es lo que mandan los tests y otros clientes.
const fechaField = (msgVacia: string) =>
    z.string()
        .min(1, msgVacia)
        .refine((s) => !Number.isNaN(new Date(s).getTime()), 'La fecha no es válida')
        .transform((s) => new Date(s));

const metodoPagoEnum = z.enum(['efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro']);
const monedaEnum = z.enum(['ARS', 'USD']);
const formaPagoEnum = z.enum(['contado', 'transferencia', 'financiado_propio', 'financiado_externo', 'canje_mas_diferencia', 'mixto']);
const estadoEntregaEnum = z.enum(['pendiente', 'bloqueada', 'autorizada', 'entregada', 'cancelada']);

const pagoItem = z.object({
    monto: montoField('El monto del pago'),
    metodo: metodoPagoEnum,
    referencia: z.string().optional(),
    observaciones: z.string().optional(),
    fecha: fechaField('La fecha del pago no puede estar vacía').optional(),
});

const externoItem = z.object({
    descripcion: z.string().min(1, 'La descripción del extra es obligatoria'),
    monto: montoField('El monto del extra'),
    comprobanteUrl: z.string().optional(),
});

const canjeItem = z.object({
    vehiculoCanjeId: idField('El vehículo de canje'),
    valorTomado: montoField('El valor de canje'),
});

export const createVentaSchema = z.object({
    sucursalId: idField('La sucursal'),
    clienteId: idField('El cliente'),
    vendedorId: idField('El vendedor'),
    vehiculoId: idField('El vehículo'),
    presupuestoId: optionalFk,
    reservaId: optionalFk,
    precioVenta: montoField('El precio de venta'),
    moneda: monedaEnum,
    formaPago: formaPagoEnum,
    fechaVenta: fechaField('La fecha de venta es obligatoria'),
    observaciones: z.string().optional(),
    pagos: z.array(pagoItem).optional(),
    externos: z.array(externoItem).optional(),
    canjes: z.array(canjeItem).optional(),
});

// El use-case descarta estadoEntrega/fechaEntrega (tienen su propio flujo). Se
// aceptan pero no se aplican; sólo se valida su forma. `observaciones` es lo que
// realmente persiste. Cualquier otro campo se descarta (anti mass-assignment).
export const updateVentaSchema = z.object({
    observaciones: z.string().optional(),
    estadoEntrega: z.string().optional(),
});

// `cancelada` es la otra "anulación" de una venta (terminal, el front la rotula
// "Anular venta"): pide motivo igual que el DELETE. Para avanzar la entrega no hace
// falta y, si llega, se ignora.
export const changeEstadoEntregaSchema = z.object({
    estadoEntrega: estadoEntregaEnum,
    motivo: motivoOpcional,
}).superRefine((v, ctx) => {
    if (v.estadoEntrega !== 'cancelada') return;
    const r = motivoObligatorio('de la anulación').safeParse(v.motivo ?? '');
    if (!r.success) {
        ctx.addIssue({ code: 'custom', path: ['motivo'], message: r.error.issues[0]?.message ?? 'Contá el motivo de la anulación' });
    }
});

// DELETE /ventas/:id — ANULAR. El motivo es obligatorio (PROC-30): queda en la venta
// (`motivoAnulacion`) y en la auditoría. `bodyOVacio` porque un DELETE sin body es lo
// que mandaba el front viejo: así el 400 dice "contá el motivo" y no "se esperaba un objeto".
export const anularVentaSchema = bodyOVacio(z.object({
    motivo: motivoObligatorio('de la anulación'),
}));

export const addPagoSchema = pagoItem;
export const addExtraSchema = externoItem;
export const addCanjeSchema = canjeItem;

// POST /presupuestos/:id/convertir-en-venta. Antes iba SIN validar: el body crudo
// (precioVenta, pagos, externos, canjes...) entraba a CreateVenta con montos
// negativos o NaN y claves extra en los create anidados. El cliente y el vehículo
// salen del presupuesto, no del body; acá sólo lo que el use-case realmente lee.
// Todo es opcional: el front manda formaPago/fechaVenta/moneda/observaciones y el
// resto se toma del presupuesto.
export const convertirPresupuestoSchema = z.object({
    sucursalId: optionalFk,
    vendedorId: optionalFk,
    precioVenta: montoField('El precio de venta').optional(),
    moneda: monedaEnum.optional(),
    formaPago: formaPagoEnum.optional(),
    fechaVenta: fechaField('La fecha de venta no puede estar vacía').optional(),
    observaciones: z.string().optional(),
    pagos: z.array(pagoItem).optional(),
    externos: z.array(externoItem).optional(),
    canjes: z.array(canjeItem).optional(),
});
