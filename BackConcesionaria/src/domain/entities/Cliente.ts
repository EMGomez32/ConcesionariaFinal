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
        /** Etapa en el embudo comercial: nuevo|contactado|negociando|ganado|perdido. */
        public readonly estadoLead: string,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly concesionaria?: { id: number; nombre: string },
        /** Vendedor "dueño" del cliente (ownership CRM). null = sin asignar. */
        public readonly vendedorAsignadoId?: number | null,
        public readonly vendedorAsignado?: { id: number; nombre: string } | null,
        /** Tipo de documento fiscal (AFIP): CUIT|CUIL|DNI|CF. null = sin definir. */
        public readonly tipoDoc?: string | null,
        /** Condición frente al IVA del receptor. Determina A vs B al facturar. */
        public readonly condicionIva?: string | null,
        /** Canal por el que entró la consulta (deruedas, instagram...). null = histórico. */
        public readonly origenLead?: string | null,
    ) { }
}
