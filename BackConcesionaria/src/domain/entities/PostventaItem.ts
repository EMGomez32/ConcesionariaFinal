export class PostventaItem {
    constructor(
        public readonly id: number,
        public readonly casoId: number,
        public readonly fecha: Date,
        public readonly descripcion: string,
        public readonly monto: number,
        /** Quién hizo el trabajo, si se tercerizó (mecánico, chapista, etc.). */
        public readonly proveedorId: number | null,
        public readonly comprobanteUrl: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly proveedor?: any
    ) { }
}
