import { IBillingRepository } from '../../../domain/repositories/IBillingRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertValidTransition } from '../../../domain/services/stateMachine';

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
        const invoice = await this.repository.findInvoiceById(invoiceId);
        if (!invoice) throw new NotFoundException('Factura');

        // HU-96: el pago se crea en `pending`. Solo si llega `succeeded`
        // explícito (porque el callback del proveedor lo confirmó), se
        // recalcula el saldo y eventualmente se marca la factura como `paid`.
        const status = data.status ?? 'pending';

        const pago = await this.repository.createPayment({
            invoiceId,
            status,
            monto: data.monto,
            moneda: data.moneda || invoice.moneda,
            metodo: data.metodo,
            provider: data.provider,
            providerPaymentId: data.providerPaymentId
        });

        if (status === 'succeeded') {
            const totalPagado = await this.repository.aggregatePaymentsByInvoice(invoiceId);
            if (totalPagado._sum.monto && Number(totalPagado._sum.monto) >= Number(invoice.total)) {
                await this.repository.updateInvoice(invoiceId, { status: 'paid', paidAt: new Date() });
            }
        }

        return pago;
    }
}
