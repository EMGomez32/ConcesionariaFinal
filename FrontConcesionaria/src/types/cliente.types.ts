/** Etapa del cliente en el embudo comercial (pipeline de leads). */
export type EstadoLead = 'nuevo' | 'contactado' | 'negociando' | 'ganado' | 'perdido';

/** Tipo de documento fiscal del receptor (AFIP). */
export type TipoDocumento = 'CUIT' | 'CUIL' | 'DNI' | 'CF';

/** Condición frente al IVA (AFIP), compartida por emisor y receptor. */
export type CondicionIva = 'responsable_inscripto' | 'monotributo' | 'exento' | 'consumidor_final';

/** Etiqueta legible de la condición frente al IVA. */
export const CONDICION_IVA_LABEL: Record<CondicionIva, string> = {
    responsable_inscripto: 'Responsable Inscripto',
    monotributo: 'Monotributo',
    exento: 'IVA Exento',
    consumidor_final: 'Consumidor Final',
};

/**
 * Etiqueta + variante de Badge por etapa. El orden del record ES el del embudo.
 * Las 5 variantes mapean a 5 clases CSS DISTINTAS (violet/cyan/warning/emerald/
 * danger): 'info' colisionaba con 'cyan' (ambas → badge-cyan), dejando "Nuevo" y
 * "Contactado" del mismo color.
 */
export const ESTADO_LEAD_MAP: Record<EstadoLead, { label: string; variant: 'violet' | 'cyan' | 'warning' | 'success' | 'danger' }> = {
    nuevo: { label: 'Nuevo', variant: 'violet' },
    contactado: { label: 'Contactado', variant: 'cyan' },
    negociando: { label: 'Negociando', variant: 'warning' },
    ganado: { label: 'Ganado', variant: 'success' },
    perdido: { label: 'Perdido', variant: 'danger' },
};

export const ESTADOS_LEAD: EstadoLead[] = ['nuevo', 'contactado', 'negociando', 'ganado', 'perdido'];

/** Canal por el que entró la consulta/lead (null = sin registrar). */
export type OrigenLead = 'deruedas' | 'instagram' | 'facebook' | 'whatsapp' | 'web' | 'mostrador' | 'referido' | 'otro';

/** Etiqueta legible por canal. El orden del array ES el del select. */
export const ORIGEN_LEAD_LABEL: Record<OrigenLead, string> = {
    deruedas: 'DeRuedas',
    instagram: 'Instagram',
    facebook: 'Facebook',
    whatsapp: 'WhatsApp',
    web: 'Web',
    mostrador: 'Mostrador',
    referido: 'Referido',
    otro: 'Otro',
};

export const ORIGENES_LEAD: OrigenLead[] = ['deruedas', 'instagram', 'facebook', 'whatsapp', 'web', 'mostrador', 'referido', 'otro'];

export interface Cliente {
    id: number;
    concesionariaId: number;
    nombre: string;
    dni?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    observaciones?: string;
    /** Etapa en el embudo comercial (default `nuevo`). */
    estadoLead?: EstadoLead;
    /** Canal de entrada del lead. null = sin registrar (altas manuales viejas). */
    origenLead?: OrigenLead | null;
    /** Vendedor "dueño" del cliente (ownership CRM). null = sin asignar. */
    vendedorAsignadoId?: number | null;
    vendedorAsignado?: { id: number; nombre: string } | null;
    /** Tipo de documento fiscal (AFIP). null/undefined = sin definir. */
    tipoDoc?: TipoDocumento | null;
    /** Condición frente al IVA (AFIP). Determina Factura A vs B. */
    condicionIva?: CondicionIva | null;
    createdAt: string;
    updatedAt: string;
    concesionaria?: {
        id: number;
        nombre: string;
    };
}

export interface ClienteFilter {
    /** Búsqueda libre: matchea nombre, DNI/CUIT, email o teléfono. */
    search?: string;
    nombre?: string;
    dni?: string;
    telefono?: string;
    concesionariaId?: number;
    /** Filtra por etapa del embudo. */
    estadoLead?: EstadoLead;
    /** Filtra por canal de entrada del lead. */
    origenLead?: OrigenLead;
    /** Filtra por vendedor "dueño" (ownership). "Mis clientes" = el id del vendedor logueado. */
    vendedorAsignadoId?: number;
}
