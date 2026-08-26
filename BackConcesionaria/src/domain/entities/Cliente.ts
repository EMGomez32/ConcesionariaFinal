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
        /**
         * La consulta que originó la ficha la fabricó el modo demostración de
         * Mercado Libre. Viaja al front porque la pantalla tiene que rotularla:
         * el lead sobrevive a apagar la demostración y sin la marca es
         * indistinguible de un interesado real.
         */
        public readonly origenSimulado: boolean = false,
        // ── Módulo del vendedor (atención presencial) ────────────────────────
        // Los cinco campos que sumó la migración del módulo. Van mapeados porque,
        // sin esto, `mapToEntity` los perdía y la ficha los devolvía siempre en
        // null: el aviso de "este cliente es de otro vendedor" calculaba la
        // retención contra un `ultimaInteraccionEn` inexistente y daba SIEMPRE
        // "vencida" — o sea, se comía la regla entera. Es el mismo bug que ya
        // había tenido `precioCompra`.
        /** Apellido, separado del nombre. Sin backfill: partir el histórico adivina mal. */
        public readonly apellido?: string | null,
        /** Ley 25.326: obligatorio antes de guardar datos de contacto. */
        public readonly consentimientoContacto: boolean = false,
        public readonly consentimientoEn?: Date | null,
        /** Cuándo se asignó el vendedor. NO es contra esto que se cuenta la retención. */
        public readonly vendedorAsignadoEn?: Date | null,
        /** Reloj de la retención: se renueva con cada contacto real. */
        public readonly ultimaInteraccionEn?: Date | null,
    ) { }
}
