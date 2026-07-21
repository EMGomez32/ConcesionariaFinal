export class Financiera {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly nombre: string,
        /** financiera | banco | otra. La UI la usa para etiquetar y filtrar. */
        public readonly tipo: string,
        public readonly contacto: string | null,
        public readonly telefono: string | null,
        public readonly email: string | null,
        public readonly activo: boolean,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null
    ) { }
}
