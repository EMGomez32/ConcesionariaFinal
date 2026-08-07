export class Concesionaria {
    constructor(
        public readonly id: number,
        public readonly nombre: string,
        public readonly cuit: string | null,
        public readonly email: string | null,
        public readonly telefono: string | null,
        public readonly direccion: string | null,
        // Marca de los documentos (PDF). Todo opcional; null = look AUTENZA default.
        public readonly logoUrl: string | null,
        public readonly logoStorageKey: string | null,
        public readonly colorPrimario: string | null,
        public readonly colorSecundario: string | null,
        public readonly pdfPie: string | null,
        public readonly sitioWeb: string | null,
        // Cupo de usuarios del tenant (lo fija el super_admin). null = ilimitado.
        public readonly limiteUsuarios: number | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly subscription?: any
    ) { }
}
