export class VehiculoArchivo {
    constructor(
        public readonly id: number,
        public readonly vehiculoId: number,
        public readonly url: string,
        public readonly tipo: string | null,
        public readonly descripcion: string | null,
        public readonly originalName: string | null,
        public readonly mimeType: string | null,
        public readonly sizeBytes: number | null,
        public readonly storageKey: string | null,
        public readonly uploadedById: number | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null
    ) { }
}
