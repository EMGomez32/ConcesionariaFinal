export class Venta {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly sucursalId: number,
        public readonly vehiculoId: number,
        public readonly clienteId: number,
        public readonly vendedorId: number,
        public readonly fechaVenta: Date,
        public readonly precioVenta: number,
        public readonly moneda: string,
        public readonly formaPago: string,
        public readonly estadoEntrega: string,
        public readonly fechaEntrega: Date | null,
        public readonly observaciones: string | null,
        public readonly presupuestoId: number | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly cliente?: any,
        public readonly vehiculo?: any,
        public readonly vendedor?: any,
        public readonly extras?: any[],
        public readonly pagos?: any[],
        public readonly canjes?: any[]
    ) { }
}
