export class TipoPostventa {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly nombre: string,
        /** Archivado: deja de ofrecerse al crear casos, pero los viejos lo siguen mostrando. */
        public readonly activo: boolean,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        /** Cuántos casos lo usan. Sólo viene en el listado del ABM. */
        public readonly casosCount?: number
    ) { }
}
