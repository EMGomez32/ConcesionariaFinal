export class Proveedor {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly nombre: string,
        public readonly tipo: string | null,
        public readonly telefono: string | null,
        public readonly email: string | null,
        public readonly direccion: string | null,
        public readonly activo: boolean,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null
    ) { }

    // Domain logic: validation or business rules
    public isValid(): boolean {
        return this.nombre.length > 0;
    }
}
