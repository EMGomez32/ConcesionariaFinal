export class GastoFijo {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly sucursalId: number | null,
        public readonly categoriaId: number,
        public readonly proveedorId: number | null,
        /** El gasto fijo se imputa a un período (año/mes), no a una fecha exacta. */
        public readonly anio: number,
        public readonly mes: number,
        public readonly descripcion: string,
        public readonly monto: number,
        public readonly moneda: string,
        public readonly comprobanteUrl: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly categoria?: any,
        public readonly sucursal?: any,
        public readonly proveedor?: any
    ) { }
}
