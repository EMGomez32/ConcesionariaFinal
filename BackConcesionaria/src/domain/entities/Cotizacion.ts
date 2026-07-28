export class Cotizacion {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        /** Día de la cotización (columna @db.Date). */
        public readonly fecha: Date,
        /** Pesos por 1 USD. Decimal de Prisma → se mapea a number. */
        public readonly valor: number,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
    ) { }
}
