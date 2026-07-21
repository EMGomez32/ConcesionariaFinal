export class Plan {
    constructor(
        public readonly id: number,
        public readonly nombre: string,
        public readonly descripcion: string | null,
        public readonly precio: number,
        public readonly periodicidad: string,
        public readonly config?: any,
        public readonly activo: boolean = true,
        public readonly createdAt: Date = new Date(),
        public readonly updatedAt: Date = new Date()
    ) { }
}

export class ConcesionariaSubscription {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly planId: number,
        public readonly status: string,
        public readonly trialEndsAt: Date | null,
        public readonly billingCycleAnchor: Date | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly plan?: Plan
    ) { }
}

export class Invoice {
    constructor(
        public readonly id: number,
        public readonly subscriptionId: number,
        public readonly status: string,
        public readonly total: number,
        public readonly moneda: string,
        public readonly periodoDesde: Date | null,
        public readonly periodoHasta: Date | null,
        public readonly dueDate: Date | null,
        public readonly paidAt: Date | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly payments?: Payment[],
        public readonly subscription?: ConcesionariaSubscription
    ) { }
}

export class Payment {
    constructor(
        public readonly id: number,
        public readonly invoiceId: number,
        public readonly status: string,
        public readonly monto: number,
        public readonly moneda: string,
        public readonly metodo: string | null,
        public readonly provider: string | null,
        public readonly providerPaymentId: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date
    ) { }
}
