import client from './client';
import type { PaginatedResponse } from '../types/api.types';
import type { Tasacion, CreateTasacionDto, UpdateTasacionDto, TasacionFilter } from '../types/tasacion.types';

export const tasacionesApi = {
    getAll: (filters: TasacionFilter = {}, options: { page?: number; limit?: number } = {}) =>
        client.get<PaginatedResponse<Tasacion>>('/tasaciones', { params: { ...filters, ...options } }),

    getById: (id: number) =>
        client.get<Tasacion>(`/tasaciones/${id}`),

    create: (data: CreateTasacionDto) =>
        client.post<Tasacion>('/tasaciones', data),

    /** Completar/actualizar una tasación existente (el tasador le pone el valor). */
    update: (id: number, data: UpdateTasacionDto) =>
        client.patch<Tasacion>(`/tasaciones/${id}`, data),

    delete: (id: number) =>
        client.delete(`/tasaciones/${id}`),

    /** PDF de la tasación para entregar al cliente. */
    pdf: (id: number) =>
        client.get<Blob>(`/tasaciones/${id}/pdf`, { responseType: 'blob' }),
};
