export class VehiculoInteres {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly clienteId: number,
        public readonly vehiculoId: number,
        public readonly nota: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        /** Datos del cliente / vehículo ya resueltos, cuando se incluyen. */
        public readonly cliente?: any,
        public readonly vehiculo?: any,
    ) { }
}
