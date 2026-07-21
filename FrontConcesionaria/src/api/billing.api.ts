import client from './client';

export type PlanInterval = 'MONTH' | 'YEAR';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused';
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'otro';

export interface Plan {
  id: number;
  nombre: string;
  interval: PlanInterval;
  precio: string;
  moneda: string;
  maxUsuarios?: number;
  maxSucursales?: number;
  maxVehiculos?: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConcesionariaSubscription {
  id: number;
  concesionariaId: number;
  planId: number;
  status: SubscriptionStatus;
  trialEndsAt?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  provider?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  createdAt: string;
  updatedAt: string;
  plan?: Plan;
  concesionaria?: { id: number; nombre: string };
}

export interface Invoice {
  id: number;
  subscriptionId: number;
  status: InvoiceStatus;
  numero?: string;
  periodoDesde?: string;
  periodoHasta?: string;
  subtotal: string;
  impuestos: string;
  total: string;
  moneda: string;
  dueDate?: string;
  paidAt?: string;
  providerInvoiceId?: string;
  pdfUrl?: string;
  createdAt: string;
  updatedAt: string;
  payments?: Payment[];
  subscription?: ConcesionariaSubscription;
}

export interface Payment {
  id: number;
  invoiceId: number;
  status: PaymentStatus;
  monto: string;
  moneda: string;
  metodo?: MetodoPago;
  provider?: string;
  providerPaymentId?: string;
  createdAt: string;
}

export interface CreatePlanDto {
  nombre: string;
  interval: PlanInterval;
  precio: number | string;
  moneda?: string;
  maxUsuarios?: number | null;
  maxSucursales?: number | null;
  maxVehiculos?: number | null;
  activo?: boolean;
}

export type UpdatePlanDto = Partial<CreatePlanDto>;

export interface UpdateSubscriptionDto {
  planId: number;
  status?: SubscriptionStatus;
  trialEndsAt?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  provider?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
}

export interface CreateInvoiceDto {
  subscriptionId: number;
  numero?: string;
  periodoDesde: string;
  periodoHasta: string;
  subtotal: number | string;
  impuestos?: number | string;
  total: number | string;
  moneda?: string;
  dueDate?: string;
  status?: InvoiceStatus;
  providerInvoiceId?: string;
  pdfUrl?: string;
}

export interface RegistrarPagoDto {
  monto: number | string;
  moneda: string;
  metodo: MetodoPago;
  provider?: string;
  providerPaymentId?: string;
}

export const billingApi = {
  // Planes
  getPlanes: (params?: { activo?: boolean }) =>
    client.get('/billing/planes', { params }),

  createPlan: (dto: CreatePlanDto) =>
    client.post('/billing/planes', dto),

  updatePlan: (id: number, dto: UpdatePlanDto) =>
    client.patch(`/billing/planes/${id}`, dto),

  // Suscripciones
  getMySubscription: () =>
    client.get('/billing/subscription'),

  getSubscriptionByConcesionaria: (concesionariaId: number) =>
    client.get(`/billing/concesionarias/${concesionariaId}/subscription`),

  updateSubscription: (concesionariaId: number, dto: UpdateSubscriptionDto) =>
    client.patch(`/billing/concesionarias/${concesionariaId}/subscription`, dto),

  // Invoices
  getInvoices: (params?: { status?: InvoiceStatus; subscriptionId?: number; page?: number; limit?: number }) =>
    client.get('/billing/invoices', { params }),

  getInvoiceById: (id: number) =>
    client.get(`/billing/invoices/${id}`),

  createInvoice: (dto: CreateInvoiceDto) =>
    client.post('/billing/invoices', dto),

  // Pagos
  registrarPago: (invoiceId: number, dto: RegistrarPagoDto) =>
    client.post(`/billing/invoices/${invoiceId}/payments`, dto),
};
