import { api } from './client';
import type { BadgeTone } from '../components/ui';

/** API de Clientes (la cartera del vendedor). */

export type EstadoLead = 'nuevo' | 'contactado' | 'negociando' | 'ganado' | 'perdido';
export type OrigenLead =
    | 'deruedas' | 'mercadolibre' | 'instagram' | 'facebook' | 'whatsapp' | 'web' | 'mostrador' | 'referido' | 'otro';

export interface Cliente {
    id: number;
    nombre: string;
    apellido?: string | null;
    telefono?: string | null;
    email?: string | null;
    dni?: string | null;
    direccion?: string | null;
    estadoLead?: EstadoLead | null;
    origenLead?: OrigenLead | null;
    observaciones?: string | null;
    vendedorAsignado?: { id: number; nombre: string } | null;
    ultimaInteraccionEn?: string | null;
}

interface Paginado<T> { results: T[]; page: number; limit: number; totalPages: number; totalResults: number }

export const clientesApi = {
    list: (search?: string, page = 1, limit = 30) =>
        api.get('/clientes', { params: { ...(search ? { search } : {}), page, limit } })
            .then((r) => r.data as Paginado<Cliente>),
    getById: (id: number) => api.get(`/clientes/${id}`).then((r) => r.data as Cliente),
};

export const ESTADO_LEAD_LABEL: Record<EstadoLead, { label: string; tone: BadgeTone }> = {
    nuevo: { label: 'Nuevo', tone: 'violet' },
    contactado: { label: 'Contactado', tone: 'cyan' },
    negociando: { label: 'Negociando', tone: 'warning' },
    ganado: { label: 'Ganado', tone: 'success' },
    perdido: { label: 'Perdido', tone: 'danger' },
};

export const ORIGEN_LEAD_LABEL: Record<OrigenLead, string> = {
    deruedas: 'DeRuedas', mercadolibre: 'Mercado Libre', instagram: 'Instagram', facebook: 'Facebook',
    whatsapp: 'WhatsApp', web: 'Web', mostrador: 'Mostrador', referido: 'Referido', otro: 'Otro',
};
