export class MetaVenta {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly anio: number,
        public readonly mes: number,
        /** Objetivo de unidades vendidas (o null si no se fijó). */
        public readonly unidadesObjetivo: number | null,
        /** Objetivo de facturado (o null si no se fijó). Decimal → number. */
        public readonly montoObjetivo: number | null,
        public readonly moneda: string,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
    ) { }
}
