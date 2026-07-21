export class PostventaCaso {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly sucursalId: number,
        public readonly clienteId: number,
        public readonly vehiculoId: number,
        public readonly ventaId: number,
        public readonly fechaReclamo: Date,
        /** Tipo del catálogo. Null en los casos históricos, previos al catálogo. */
        public readonly tipoId: number | null,
        /**
         * Nombre del tipo, ya resuelto: sale del catálogo y, si el caso es de
         * antes (tipoId null), cae al texto libre que se guardó en su momento.
         * Se expone así para que la UI muestre siempre algo sin tener que
         * conocer la diferencia.
         */
        public readonly tipo: string | null,
        public readonly descripcion: string,
        public readonly estado: string,
        public readonly fechaCierre: Date | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly cliente?: any,
        public readonly vehiculo?: any,
        public readonly sucursal?: any,
        public readonly items?: any[],
        /** El tipo del catálogo completo (id, nombre, activo). */
        public readonly tipoRef?: any
    ) { }
}
