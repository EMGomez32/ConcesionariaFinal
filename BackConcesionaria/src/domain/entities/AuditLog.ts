export class AuditLog {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly usuarioId: number | null,
        public readonly entidad: string,
        public readonly entidadId: number | null,
        public readonly accion: string,
        public readonly detalle: string | null,
        public readonly ip: string | null,
        public readonly userAgent: string | null,
        public readonly createdAt: Date,
        public readonly usuario?: any
    ) { }
}
