export class Sucursal {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly nombre: string,
        public readonly direccion: string | null,
        public readonly ciudad: string | null,
        public readonly email: string | null,
        public readonly telefono: string | null,
        public readonly activo: boolean,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        /** Concesionaria (tenant) embebida: la tabla del front la muestra en una columna. */
        public readonly concesionaria?: any
    ) { }
}
