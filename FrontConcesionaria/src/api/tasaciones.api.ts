import client from './client';
import type { PaginatedResponse } from '../types/api.types';
import type { Tasacion, CreateTasacionDto, TasacionFilter } from '../types/tasacion.types';

export const tasacionesApi = {
    getAll: (filters: TasacionFilter = {}, options: { page?: number; limit?: number } = {}) =>
        client.get<PaginatedResponse<Tasacion>>('/tasaciones', { params: { ...filters, ...options } }),

    getById: (id: number) =>
        client.get<Tasacion>(`/tasaciones/${id}`),

    create: (data: CreateTasacionDto) =>
        client.post<Tasacion>('/tasaciones', data),

    delete: (id: number) =>
        client.delete(`/tasaciones/${id}`),

    /** PDF de la tasación para entregar al cliente. */
    pdf: (id: number) =>
        client.get<Blob>(`/tasaciones/${id}/pdf`, { responseType: 'blob' }),
};
