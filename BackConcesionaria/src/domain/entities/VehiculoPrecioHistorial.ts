export class VehiculoPrecioHistorial {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly vehiculoId: number,
        /** Precio de lista anterior. null en el registro inicial (alta del vehículo). */
        public readonly precioAnterior: number | null,
        public readonly precioNuevo: number,
        public readonly moneda: string,
        public readonly motivo: string | null,
        public readonly usuarioId: number | null,
        public readonly createdAt: Date,
        /** Datos del usuario que hizo el cambio, cuando se incluyen. */
        public readonly usuario?: any,
    ) { }
}
