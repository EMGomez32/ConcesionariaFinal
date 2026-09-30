import { z } from 'zod';

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
