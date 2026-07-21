export class Financiacion {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly sucursalId: number | null,
        public readonly ventaId: number,
        public readonly clienteId: number,
        public readonly cobradorId: number | null,
        public readonly montoFinanciado: number,
        public readonly moneda: string,
        public readonly cuotas: number,
        public readonly diaVencimiento: number,
        public readonly tasaMensual: number | null,
        public readonly fechaInicio: Date,
        public readonly estado: string,
        public readonly observaciones: string | null,
        /** Contrato que esta financiación refinancia. Null si es la original. */
        public readonly refinanciaAId: number | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly venta?: any,
        public readonly cliente?: any,
        public readonly cuotasPlan?: any[],
        /** El contrato viejo que este refinancia (para linkear hacia atrás). */
        public readonly refinanciaA?: any,
        /** La refinanciación que cerró a este contrato (para linkear hacia adelante). */
        public readonly refinanciadaPor?: any
    ) { }
}

export class Cuota {
    constructor(
        public readonly id: number,
        public readonly financiacionId: number,
        public readonly nroCuota: number,
        public readonly montoCuota: number,
        public readonly saldoCuota: number,
        public readonly vencimiento: Date,
        public readonly estado: string,
        public readonly createdAt: Date,
        public readonly updatedAt: Date
    ) { }
}
