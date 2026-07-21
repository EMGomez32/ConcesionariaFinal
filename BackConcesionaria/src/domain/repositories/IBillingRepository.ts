import { Plan, ConcesionariaSubscription, Invoice, Payment } from '../entities/Billing';
import { QueryOptions } from '../../types/common';

export interface IBillingRepository {
    // Planes
    findAllPlanes(filter?: any): Promise<Plan[]>;
    findPlanById(id: number): Promise<Plan | null>;
    createPlan(data: any): Promise<Plan>;
    updatePlan(id: number, data: any): Promise<Plan>;

    // Suscripciones
    findSubscriptionByConcesionariaId(id: number): Promise<ConcesionariaSubscription | null>;
    upsertSubscription(concesionariaId: number, data: any): Promise<ConcesionariaSubscription>;
    findSubscriptionById(id: number): Promise<ConcesionariaSubscription | null>;

    // Invoices
    findAllInvoices(filter?: any, options?: QueryOptions): Promise<Invoice[]>;
    findInvoiceById(id: number): Promise<Invoice | null>;
    createInvoice(data: any): Promise<Invoice>;
    updateInvoice(id: number, data: any): Promise<Invoice>;

    // Pagos
    createPayment(data: any): Promise<Payment>;
    aggregatePaymentsByInvoice(invoiceId: number): Promise<{ _sum: { monto: number | null } }>;
}
