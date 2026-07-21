import { IBillingRepository } from '../../../domain/repositories/IBillingRepository';
import { Plan, ConcesionariaSubscription, Invoice, Payment } from '../../../domain/entities/Billing';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions } from '../../../types/common';

export class PrismaBillingRepository implements IBillingRepository {
    // Planes
    async findAllPlanes(filter: any = {}): Promise<Plan[]> {
        const where = coerceFilter(filter);
        const results = await prisma.plan.findMany({
            where,
            orderBy: { precio: 'asc' }
        });
        return results.map(this.mapPlanToEntity);
    }

    async findPlanById(id: number): Promise<Plan | null> {
        const p = await prisma.plan.findUnique({ where: { id } });
        return p ? this.mapPlanToEntity(p) : null;
    }

    async createPlan(data: any): Promise<Plan> {
        const p = await prisma.plan.create({ data });
        return this.mapPlanToEntity(p);
    }

    async updatePlan(id: number, data: any): Promise<Plan> {
        const p = await prisma.plan.update({ where: { id }, data });
        return this.mapPlanToEntity(p);
    }

    // Suscripciones
    async findSubscriptionByConcesionariaId(concesionariaId: number): Promise<ConcesionariaSubscription | null> {
        const s = await prisma.concesionariaSubscription.findUnique({
            where: { concesionariaId },
            include: { plan: true }
        });
        return s ? this.mapSubscriptionToEntity(s) : null;
    }

    async findSubscriptionById(id: number): Promise<ConcesionariaSubscription | null> {
        const s = await prisma.concesionariaSubscription.findUnique({
            where: { id },
            include: { plan: true }
        });
        return s ? this.mapSubscriptionToEntity(s) : null;
    }

    async upsertSubscription(concesionariaId: number, data: any): Promise<ConcesionariaSubscription> {
        const { planId, status, trialEndsAt, ...rest } = data;
        const s = await prisma.concesionariaSubscription.upsert({
            where: { concesionariaId },
            update: {
                planId,
                status,
                trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
                ...rest
            },
            create: {
                concesionariaId,
                planId,
                status: status || 'trialing',
                trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
                ...rest
            },
            include: { plan: true }
        });
        return this.mapSubscriptionToEntity(s);
    }

    // Invoices
    async findAllInvoices(filter: any = {}, options: QueryOptions = {}): Promise<Invoice[]> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const where = coerceFilter(filter);
        const results = await prisma.invoice.findMany({
            where,
            take: Number(limit),
            skip: (Number(page) - 1) * Number(limit),
            orderBy: { [sortBy as string]: sortOrder },
            include: { payments: true }
        });
        return results.map(this.mapInvoiceToEntity);
    }

    async findInvoiceById(id: number): Promise<Invoice | null> {
        const i = await prisma.invoice.findUnique({
            where: { id },
            include: { payments: true, subscription: { include: { plan: true, concesionaria: true } } }
        });
        return i ? this.mapInvoiceToEntity(i) : null;
    }

    async createInvoice(data: any): Promise<Invoice> {
        const i = await prisma.invoice.create({
            data: {
                ...data,
                periodoDesde: data.periodoDesde ? new Date(data.periodoDesde) : null,
                periodoHasta: data.periodoHasta ? new Date(data.periodoHasta) : null,
                dueDate: data.dueDate ? new Date(data.dueDate) : null
            }
        });
        return this.mapInvoiceToEntity(i);
    }

    async updateInvoice(id: number, data: any): Promise<Invoice> {
        const i = await prisma.invoice.update({
            where: { id },
            data: {
                ...data,
                paidAt: data.paidAt ? new Date(data.paidAt) : undefined
            }
        });
        return this.mapInvoiceToEntity(i);
    }

    // Pagos
    async createPayment(data: any): Promise<Payment> {
        const p = await prisma.payment.create({ data });
        return this.mapPaymentToEntity(p);
    }

    async aggregatePaymentsByInvoice(invoiceId: number): Promise<{ _sum: { monto: number | null } }> {
        const agg = await prisma.payment.aggregate({
            _sum: { monto: true },
            where: { invoiceId, status: 'succeeded' }
        });
        return { _sum: { monto: agg._sum.monto ? Number(agg._sum.monto) : null } };
    }

    // Mappers
    private mapPlanToEntity(p: any): Plan {
        return new Plan(p.id, p.nombre, p.descripcion, Number(p.precio), p.periodicidad, p.config, p.activo, p.createdAt, p.updatedAt);
    }

    private mapSubscriptionToEntity(s: any): ConcesionariaSubscription {
        return new ConcesionariaSubscription(
            s.id,
            s.concesionariaId,
            s.planId,
            s.status,
            s.trialEndsAt,
            s.billingCycleAnchor,
            s.createdAt,
            s.updatedAt,
            s.plan ? this.mapPlanToEntity(s.plan) : undefined
        );
    }

    private mapInvoiceToEntity(i: any): Invoice {
        return new Invoice(
            i.id,
            i.subscriptionId,
            i.status,
            Number(i.total),
            i.moneda,
            i.periodoDesde,
            i.periodoHasta,
            i.dueDate,
            i.paidAt,
            i.createdAt,
            i.updatedAt,
            i.payments ? i.payments.map((p: any) => this.mapPaymentToEntity(p)) : undefined,
            i.subscription ? this.mapSubscriptionToEntity(i.subscription) : undefined
        );
    }

    private mapPaymentToEntity(p: any): Payment {
        return new Payment(p.id, p.invoiceId, p.status, Number(p.monto), p.moneda, p.metodo, p.provider, p.providerPaymentId, p.createdAt, p.updatedAt);
    }
}
