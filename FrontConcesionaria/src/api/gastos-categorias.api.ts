import client from './client';
import type { PaginatedResponse } from '../types/api.types';

export interface GastoCategoria {
    id: number;
    nombre: string;
    descripcion?: string;
    activo?: boolean;
    concesionariaId?: number;
    createdAt?: string;
}

export const gastosCategoriaApi = {
    getAll: (params?: { activo?: boolean }) =>
        client.get<PaginatedResponse<GastoCategoria> | GastoCategoria[]>('/gastos-categorias', { params }),

    create: (data: { nombre: string; descripcion?: string }) =>
        client.post<GastoCategoria>('/gastos-categorias', data),

    update: (id: number, data: { nombre?: string; descripcion?: string }) =>
        client.patch<GastoCategoria>(`/gastos-categorias/${id}`, data),

    delete: (id: number) =>
        client.delete<void>(`/gastos-categorias/${id}`),
};
