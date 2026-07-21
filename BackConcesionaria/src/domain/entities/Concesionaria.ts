export class Concesionaria {
    constructor(
        public readonly id: number,
        public readonly nombre: string,
        public readonly cuit: string | null,
        public readonly email: string | null,
        public readonly telefono: string | null,
        public readonly direccion: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly subscription?: any
    ) { }
}
