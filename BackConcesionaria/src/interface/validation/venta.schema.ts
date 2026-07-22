import { z } from 'zod';

// Schemas de validación de ventas. Payloads verificados contra los DTOs reales
// del front (ventas.api.ts, VentaSubResources.tsx). Se usa `coerce` para aceptar
// tanto números como strings numéricos sin romper, y la lista explícita de campos
// CORTA el mass-assignment: el use-case hacía `...ventaData` sobre el body crudo,
// con lo que se podía inyectar estadoEntrega/id/concesionariaId. Zod descarta todo
// lo no declarado.

const idField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` }).int(`${label} inválido`).positive(`${label} es obligatorio`);

const montoField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` }).positive(`${label} debe ser mayor a 0`);

// FK opcional: 0 / '' / null se interpretan como "sin FK" (undefined), porque el
// form puede inicializar el campo en 0. Si viene un id real, se valida positivo.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

const metodoPagoEnum = z.enum(['efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro']);
const monedaEnum = z.enum(['ARS', 'USD']);
const formaPagoEnum = z.enum(['contado', 'transferencia', 'financiado_propio', 'financiado_externo', 'canje_mas_diferencia', 'mixto']);
const estadoEntregaEnum = z.enum(['pendiente', 'bloqueada', 'autorizada', 'entregada', 'cancelada']);

const pagoItem = z.object({
    monto: montoField('El monto del pago'),
    metodo: metodoPagoEnum,
    referencia: z.string().optional(),
    observaciones: z.string().optional(),
    fecha: z.string().optional(),
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
    fechaVenta: z.string().min(1, 'La fecha de venta es obligatoria'),
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

export const changeEstadoEntregaSchema = z.object({
    estadoEntrega: estadoEntregaEnum,
});

export const addPagoSchema = pagoItem;
export const addExtraSchema = externoItem;
export const addCanjeSchema = canjeItem;
