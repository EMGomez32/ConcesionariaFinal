export class VehiculoMovimiento {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly vehiculoId: number,
        public readonly registradoPorId: number | null,
        public readonly desdeSucursalId: number | null,
        public readonly hastaSucursalId: number | null,
        public readonly tipo: string,
        public readonly fecha: Date,
        public readonly motivo: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly vehiculo?: any,
        public readonly desdeSucursal?: any,
        public readonly hastaSucursal?: any,
        public readonly registradoPor?: any,
        public readonly destino: string | null = null,
        public readonly fechaRetorno: Date | null = null,
        public readonly proveedorDestinoId: number | null = null,
        public readonly proveedorDestino?: any
    ) { }
}
