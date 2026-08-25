import { Prisma } from '@prisma/client';
import { IBillingRepository } from '../../../domain/repositories/IBillingRepository';
import { Payment } from '../../../domain/entities/Billing';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertValidTransition } from '../../../domain/services/stateMachine';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';

// Planes
export class GetPlanes {
    constructor(private readonly repository: IBillingRepository) { }
    async execute(filter?: any) { return this.repository.findAllPlanes(filter); }
}

export class CreatePlan {
    constructor(private readonly repository: IBillingRepository) { }
    async execute(data: any) { return this.repository.createPlan(data); }
}

export class UpdatePlan {
    constructor(private readonly repository: IBillingRepository) { }
    async execute(id: number, data: any) {
        const exists = await this.repository.findPlanById(id);
        if (!exists) throw new NotFoundException('Plan');
        return this.repository.updatePlan(id, data);
    }
}

// Suscripciones
export class GetSubscriptionByConcesionariaId {
    constructor(private readonly repository: IBillingRepository) { }
    async execute(concesionariaId: number) {
        return this.repository.findSubscriptionByConcesionariaId(concesionariaId);
    }
}

export class CreateOrUpdateSubscription {
    constructor(private readonly repository: IBillingRepository) { }
    async execute(concesionariaId: number, data: any) {
        if (data.status) {
            const current: any = await this.repository.findSubscriptionByConcesionariaId(concesionariaId);
            if (current && current.status && current.status !== data.status) {
                assertValidTransition('suscripcion', current.status, data.status);
            }
        }
        return this.repository.upsertSubscription(concesionariaId, data);
    }
}

// Invoices
export class GetInvoices {
    constructor(private readonly repository: IBillingRepository) { }
    async execute(filter: any = {}, options: any = {}) { return this.repository.findAllInvoices(filter, options); }
}

export class CreateInvoice {
    constructor(private readonly repository: IBillingRepository) { }
    async execute(data: any) {
        // HU-94: si el cliente no manda `total`, calcularlo a partir de
        // subtotal + impuestos. Si tampoco viene `subtotal`, devolver error.
        const payload = { ...data };
        const subtotal = payload.subtotal !== undefined ? Number(payload.subtotal) : null;
        const impuestos = payload.impuestos !== undefined ? Number(payload.impuestos) : 0;

        if (subtotal === null) {
            throw new BaseException(400, 'subtotal es obligatorio para crear una factura', 'VALIDATION_ERROR');
        }
        payload.subtotal = subtotal;
        payload.impuestos = impuestos;
        if (payload.total === undefined || payload.total === null) {
            payload.total = subtotal + impuestos;
        }
        return this.repository.createInvoice(payload);
    }
}

export class GetInvoiceById {
    constructor(private readonly repository: IBillingRepository) { }
    async execute(id: number) {
        const i = await this.repository.findInvoiceById(id);
        if (!i) throw new NotFoundException('Factura');
        return i;
    }
}

// Pagos
export class RegistrarPagoInvoice {
    constructor(private readonly repository: IBillingRepository) { }
    async execute(invoiceId: number, data: any) {
        // La ruta de pago de invoices es authorize('admin'): un admin paga las facturas
        // de SU concesionaria (super_admin, cualquiera). Filtro de tenant EXPLÍCITO — el
        // tx raw NO pasa por la extensión, así que el aislamiento no puede depender sólo
        // de la RLS (misma regla que RegistrarPagoCuota).
        const isSuper = context.getUser()?.roles?.includes('super_admin') || false;

        // `status` NO se acepta del body de un admin. Abajo, un pago 'succeeded' que
        // cubre el total marca la factura 'paid': dejar que el tenant se declare
        // 'succeeded' es dejar que se dé por pagado el SaaS él solo. El admin registra
        // el pago y queda 'pending' hasta que la plataforma (o el callback del proveedor,
        // que corre como super_admin) lo confirme.
        const status = isSuper ? (data.status ?? 'pending') : 'pending';
        const tenantId = context.getTenantId();
        if (!isSuper && !tenantId) throw new BaseException(401, 'Sesión sin concesionaria', 'UNAUTHORIZED');
        const tenantSql = isSuper ? Prisma.empty : Prisma.sql`AND concesionaria_id = ${tenantId}`;
        const tenantWhere = isSuper ? {} : { concesionariaId: tenantId };

        // Unit of Work: registrar el pago y (si corresponde) marcar la factura 'paid'
        // commitean JUNTOS, con la factura LOCKEADA (FOR UPDATE) para serializar dos
        // pagos concurrentes que la marcarían paid dos veces. Antes NO había transacción
        // (createPayment + updateInvoice sueltos). concesionaria_id del pago lo deriva el
        // trigger derive_concesionaria_payments desde la factura.
        return withTenantTransaction(async (tx) => {
            const rows = await tx.$queryRaw<Array<{ total: string; moneda: string }>>(Prisma.sql`
                SELECT total, moneda FROM invoices
                WHERE id = ${invoiceId} AND deleted_at IS NULL ${tenantSql}
                FOR UPDATE`);
            const inv = rows[0];
            if (!inv) throw new NotFoundException('Factura');

            // HU-96: el pago se crea en 'pending'. Sólo si llega 'succeeded' explícito
            // (el callback del proveedor lo confirmó) se recalcula el saldo y
            // eventualmente se marca la factura 'paid'.
            const pago = await tx.payment.create({
                data: {
                    invoiceId,
                    status,
                    monto: data.monto,
                    moneda: data.moneda || inv.moneda,
                    metodo: data.metodo,
                    provider: data.provider,
                    providerPaymentId: data.providerPaymentId,
                },
            });

            if (status === 'succeeded') {
                // deletedAt:null a mano: el tx raw no auto-filtra el soft-delete como la
                // extensión → un pago borrado no debe sumar y marcar la factura 'paid'.
                const totalPagado = await tx.payment.aggregate({
                    _sum: { monto: true },
                    where: { invoiceId, status: 'succeeded', deletedAt: null, ...tenantWhere },
                });
                if (totalPagado._sum.monto && Number(totalPagado._sum.monto) >= Number(inv.total)) {
                    await tx.invoice.update({
                        where: { id: invoiceId, ...tenantWhere },
                        data: { status: 'paid', paidAt: new Date() },
                    });
                }
            }

            // Remapear a la entidad de dominio (mismo contrato que repository.createPayment):
            // monto como number (la fila cruda serializa el Decimal como string) y sin
            // exponer columnas internas (concesionariaId/deletedAt).
            return new Payment(
                pago.id, pago.invoiceId, pago.status, Number(pago.monto), pago.moneda,
                pago.metodo, pago.provider, pago.providerPaymentId, pago.createdAt, pago.updatedAt,
            );
        });
    }
}
