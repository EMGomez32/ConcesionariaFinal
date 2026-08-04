/** Etapa del cliente en el embudo comercial (pipeline de leads). */
export type EstadoLead = 'nuevo' | 'contactado' | 'negociando' | 'ganado' | 'perdido';

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
}
