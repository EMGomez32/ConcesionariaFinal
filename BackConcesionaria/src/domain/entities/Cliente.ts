export class Cliente {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly nombre: string,
        public readonly dni: string | null,
        public readonly telefono: string | null,
        public readonly email: string | null,
        public readonly direccion: string | null,
        public readonly observaciones: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly concesionaria?: { id: number; nombre: string }
    ) { }
}
