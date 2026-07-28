import client from './client';
import type { PaginatedResponse } from '../types/api.types';

export interface Cotizacion {
    id: number;
    concesionariaId?: number;
    /** Día de la cotización (YYYY-MM-DD). */
    fecha: string;
    /** Pesos por 1 USD. */
    valor: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface CotizacionFilter {
    desde?: string;
    hasta?: string;
    page?: number;
    limit?: number;
}

export const cotizacionesApi = {
    getAll: (filters: CotizacionFilter = {}) =>
        client.get<PaginatedResponse<Cotizacion>>('/cotizaciones', { params: filters }),

    /** La cotización vigente a una fecha (o la última cargada). Devuelve null si no hay ninguna. */
    getVigente: (fecha?: string) =>
        client.get<Cotizacion | null>('/cotizaciones/vigente', { params: fecha ? { fecha } : {} }),

    /** Carga (o pisa) la cotización de un día. Solo admin. */
    upsert: (data: { fecha: string; valor: number }) =>
        client.post<Cotizacion>('/cotizaciones', data),

    delete: (id: number) =>
        client.delete<void>(`/cotizaciones/${id}`),
};
