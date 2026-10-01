import { api } from './client';
import { CondicionTasacion, CONDICION_LABEL, CONDICIONES, num, Importe } from './atenciones.api';

export { CONDICION_LABEL, CONDICIONES };
export type { CondicionTasacion };

/**
 * API de Tasaciones (el rol tasador). Espeja el backend, incluida la función del
 * PR #92: `PATCH /tasaciones/:id` completa una tasación pendiente EN EL LUGAR
 * (no crea otra). El dominio es obligatorio en el alta.
 */

export interface Tasacion {
    id: number;
    clienteId?: number | null;
    tasadorId?: number | null;
    marca: string;
    modelo: string;
    anio?: number | null;
    km?: number | null;
    dominio?: string | null;
    condicion: CondicionTasacion;
    valorEstimado?: Importe;
    moneda: 'ARS' | 'USD';
    fecha: string;
    observaciones?: string | null;
    cliente?: { id: number; nombre: string; telefono?: string | null } | null;
    tasador?: { id: number; nombre: string } | null;
}

export interface CreateTasacionDto {
    marca: string;
    modelo: string;
    fecha: string;
    dominio: string;
    anio?: number;
    km?: number;
    condicion?: CondicionTasacion;
    valorEstimado?: number;
    moneda?: 'ARS' | 'USD';
    observaciones?: string;
}

export interface UpdateTasacionDto {
    valorEstimado?: number;
    moneda?: 'ARS' | 'USD';
    condicion?: CondicionTasacion;
    dominio?: string;
    anio?: number;
    km?: number;
    observaciones?: string;
}

interface Paginado<T> { results: T[]; page: number; limit: number; totalPages: number; totalResults: number }

export const tasacionesApi = {
    list: (search?: string, page = 1, limit = 20) =>
        api.get('/tasaciones', { params: { ...(search ? { search } : {}), page, limit } })
            .then((r) => r.data as Paginado<Tasacion>),

    create: (data: CreateTasacionDto) =>
        api.post('/tasaciones', data).then((r) => r.data as Tasacion),

    /** Completar/actualizar una tasación existente (el tasador le pone el valor). */
    update: (id: number, data: UpdateTasacionDto) =>
        api.patch(`/tasaciones/${id}`, data).then((r) => r.data as Tasacion),

    remove: (id: number) => api.delete(`/tasaciones/${id}`).then((r) => r.data),
};

/** true = pendiente ("A convenir"): sin valor todavía. */
export const estaPendiente = (t: Tasacion) => num(t.valorEstimado) == null;

/** Fecha local YYYY-MM-DD (no toISOString: de noche en UTC-3 daría mañana). */
export const hoyLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
