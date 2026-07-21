export class CategoriaGastoFijo {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly nombre: string,
        /** Archivar una categoría en vez de borrarla (no se puede borrar si tiene gastos). */
        public readonly activo: boolean,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null
    ) { }
}
