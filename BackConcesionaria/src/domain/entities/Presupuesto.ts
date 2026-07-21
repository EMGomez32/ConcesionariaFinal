export class Presupuesto {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly sucursalId: number,
        public readonly clienteId: number,
        public readonly vendedorId: number,
        public readonly nroPresupuesto: string,
        public readonly fechaCreacion: Date,
        public readonly validoHasta: Date | null,
        public readonly estado: string,
        public readonly moneda: string,
        public readonly observaciones: string | null,
        public readonly pdfUrl: string | null,
        /** Items + extras. Derivado: no existe como columna. */
        public readonly subtotal: number,
        /** subtotal - valor del canje. Derivado: no existe como columna. */
        public readonly total: number,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly cliente?: any,
        public readonly sucursal?: any,
        public readonly vendedor?: any,
        public readonly items?: any[],
        public readonly extras?: any[],
        public readonly canje?: any
    ) { }
}
