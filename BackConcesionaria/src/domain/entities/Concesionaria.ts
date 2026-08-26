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
        // ── Módulo del vendedor (atención presencial) ────────────────────────
        // Cuánto tiempo un cliente le "pertenece" al vendedor que lo atendió
        // primero. Lo define cada concesionaria (decisión del dueño); sugerido 30.
        // El plazo se cuenta contra `Cliente.ultimaInteraccionEn`.
        public readonly diasRetencionCliente: number,
        // En algunas concesionarias el vendedor estima la permuta; en otras sólo
        // el tasador. false = el vendedor puede estimar.
        public readonly tasacionSoloTasador: boolean,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly subscription?: any
    ) { }
}
