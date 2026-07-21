export class IngresoVehiculo {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly vehiculoId: number,
        public readonly registradoPorId: number | null,
        public readonly sucursalId: number | null,
        public readonly clienteOrigenId: number | null,
        public readonly proveedorOrigenId: number | null,
        public readonly fechaIngreso: Date,
        public readonly tipoIngreso: string,
        public readonly valorTomado: number | null,
        public readonly nroIngreso: string,
        public readonly observaciones: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly vehiculo?: any,
        public readonly sucursal?: any,
        public readonly registradoPor?: any,
        public readonly clienteOrigen?: any,
        public readonly proveedorOrigen?: any
    ) { }
}
