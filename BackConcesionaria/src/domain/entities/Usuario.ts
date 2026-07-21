export class Usuario {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number | null,
        public readonly sucursalId: number | null,
        public readonly nombre: string,
        public readonly email: string,
        public readonly passwordHash: string | null,
        public readonly activo: boolean,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly roles?: any[],
        public readonly sucursal?: any
    ) { }
}
