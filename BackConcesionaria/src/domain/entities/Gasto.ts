export class Gasto {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly sucursalId: number | null,
        public readonly vehiculoId: number | null,
        public readonly categoriaId: number | null,
        public readonly proveedorId: number | null,
        public readonly usuarioId: number | null,
        public readonly descripcion: string | null,
        public readonly monto: number,
        public readonly fecha: Date,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly categoria?: any,
        public readonly vehiculo?: any,
        public readonly proveedor?: any,
        public readonly moneda: string = 'ARS'
    ) { }
}
