import { z } from 'zod';
import { urlComprobanteOpcional } from './urlComprobante';

// POST /billing/invoices/:id/payments (lo llama el admin del tenant). Antes sin validar:
// `monto` llegaba crudo a Prisma (string, negativo, NaN → 500 o un pago negativo).
// `status` se acepta en la forma pero el use-case lo IGNORA para no-super_admin (un
// tenant no puede darse un pago por 'succeeded').
export const registrarPagoInvoiceSchema = z.object({
    monto: z.coerce
        .number({ error: 'El monto es obligatorio' })
        .positive('El monto debe ser mayor a 0')
        .max(1_000_000_000, 'El monto es demasiado grande'),
    moneda: z.enum(['ARS', 'USD']).optional(),
    metodo: z.enum(['efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro']).optional(),
    provider: z.string().trim().max(50).optional(),
    providerPaymentId: z.string().trim().max(100).optional(),
    status: z.enum(['pending', 'succeeded', 'failed', 'refunded']).optional(),
});

// ── Rutas de super_admin (catálogo de planes, suscripción, facturas del SaaS) ─────────
// Antes pasaban `req.body` crudo a Prisma: cualquier columna del modelo entraba (mass
// assignment acotado a la cuenta de plataforma, pero con `deletedAt`, `createdAt`, ids…) y
// un payload con otra forma terminaba en un 500 opaco. Ahora cada ruta declara lo que
// acepta y Zod descarta el resto. Los campos salen de los DTO del front (billing.api.ts).

const monto = (campo: string) => z.coerce
    .number({ error: `${campo} tiene que ser un número` })
    .min(0, `${campo} no puede ser negativo`)
    .max(1_000_000_000, `${campo} es demasiado grande`);

// Tope opcional del plan: null = ilimitado; '' (input vacío) cuenta como no enviado.
const topeOpcional = z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int('El tope tiene que ser un número entero').positive('El tope tiene que ser mayor a 0').nullable().optional(),
);

// Fecha opcional: null la limpia, '' cuenta como no enviada. Se convierte a Date (Prisma no
// acepta 'YYYY-MM-DD' como DateTime).
const fechaOpcional = z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.date({ error: 'La fecha no es válida' }).nullable().optional(),
);

const textoCorto = (max: number) => z.string().trim().max(max).nullable().optional();

const planBase = {
    nombre: z.string({ error: 'El nombre del plan es obligatorio' }).trim().min(1, 'El nombre del plan es obligatorio').max(100),
    interval: z.enum(['MONTH', 'YEAR'], { error: 'El período tiene que ser MONTH o YEAR' }),
    precio: monto('El precio'),
    moneda: z.enum(['ARS', 'USD']).optional(),
    maxUsuarios: topeOpcional,
    maxSucursales: topeOpcional,
    maxVehiculos: topeOpcional,
    activo: z.boolean().optional(),
};

// POST /billing/planes
export const createPlanSchema = z.object(planBase);

// PATCH /billing/planes/:id — todo opcional.
export const updatePlanSchema = z.object({
    nombre: planBase.nombre.optional(),
    interval: planBase.interval.optional(),
    precio: planBase.precio.optional(),
    moneda: planBase.moneda,
    maxUsuarios: topeOpcional,
    maxSucursales: topeOpcional,
    maxVehiculos: topeOpcional,
    activo: planBase.activo,
});

// PATCH /billing/concesionarias/:id/subscription (upsert): el plan es obligatorio porque
// crear la suscripción lo necesita. La transición de estado la valida el caso de uso.
export const updateSubscriptionSchema = z.object({
    planId: z.coerce.number({ error: 'El plan es obligatorio' }).int().positive('El plan es obligatorio'),
    status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'paused']).optional(),
    trialEndsAt: fechaOpcional,
    currentPeriodStart: fechaOpcional,
    currentPeriodEnd: fechaOpcional,
    provider: textoCorto(50),
    providerCustomerId: textoCorto(100),
    providerSubscriptionId: textoCorto(100),
});

// POST /billing/invoices. `total` es opcional: si no viene, el caso de uso lo calcula como
// subtotal + impuestos. El tenant de la factura lo deriva la base desde la suscripción.
export const createInvoiceSchema = z.object({
    subscriptionId: z.coerce.number({ error: 'La suscripción es obligatoria' }).int().positive('La suscripción es obligatoria'),
    numero: z.string().trim().max(50).optional(),
    periodoDesde: fechaOpcional,
    periodoHasta: fechaOpcional,
    subtotal: monto('El subtotal'),
    impuestos: monto('Los impuestos').optional(),
    total: monto('El total').optional(),
    moneda: z.enum(['ARS', 'USD']).optional(),
    dueDate: fechaOpcional,
    status: z.enum(['draft', 'open', 'paid', 'void', 'uncollectible']).optional(),
    providerInvoiceId: z.string().trim().max(100).optional(),
    pdfUrl: urlComprobanteOpcional(),
});
