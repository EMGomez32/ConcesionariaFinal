export class Vehiculo {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly sucursalId: number,
        public readonly marca: string,
        public readonly modelo: string,
        public readonly version: string | null,
        public readonly anio: number | null,
        public readonly dominio: string | null,
        public readonly vin: string | null,
        public readonly kmIngreso: number | null,
        public readonly color: string | null,
        public readonly estado: string,
        public readonly fechaIngreso: Date,
        public readonly precioLista: number | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly sucursal?: any,
        public readonly archivos?: any[],
        public readonly moneda: string = 'ARS'
    ) { }

    public isAvailable(): boolean {
        return this.estado === 'publicado' || this.estado === 'preparacion';
    }
}
