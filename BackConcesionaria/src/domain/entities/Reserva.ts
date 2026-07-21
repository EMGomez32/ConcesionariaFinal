export class Reserva {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly sucursalId: number,
        public readonly vehiculoId: number,
        public readonly clienteId: number,
        public readonly usuarioId: number,
        public readonly montoReserva: number,
        public readonly fechaReserva: Date,
        public readonly fechaVencimiento: Date | null,
        public readonly estado: string,
        public readonly observaciones: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly cliente?: any,
        public readonly vehiculo?: any,
        public readonly sucursal?: any,
        public readonly creadaPor?: any
    ) { }
}
