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
        public readonly moneda: string = 'ARS',
        /** Vencimiento de la VTV y del seguro (documentación del vehículo). */
        public readonly vencimientoVtv: Date | null = null,
        public readonly vencimientoSeguro: Date | null = null,
        /**
         * Datos de compra. Se persistían pero NO estaban acá, así que
         * `mapToEntity` los perdía y nunca volvían en un GET: el precio de compra
         * quedaba guardado e invisible hasta para el admin, y la ficha mostraba
         * dos renglones muertos.
         *
         * `precioCompra` es DATO SENSIBLE —es el número del que sale el margen—
         * así que la entidad los mapea siempre y quien decide si salen al cliente
         * es `VehiculoController`, que se los recorta a todo el que no sea admin
         * (mismo criterio que `sanitizarVehiculosComprados` en la ficha del
         * proveedor). Ojo: la proyección VEHICULO_PUBLICO sigue SIN incluirlos, y
         * así tiene que quedar — es la que se usa en los `include` anidados.
         */
        public readonly precioCompra: number | null = null,
        public readonly fechaCompra: Date | null = null
    ) { }

    public isAvailable(): boolean {
        return this.estado === 'publicado' || this.estado === 'preparacion';
    }
}
