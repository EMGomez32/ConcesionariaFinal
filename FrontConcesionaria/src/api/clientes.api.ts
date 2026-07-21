import client from './client';
import type { Cliente, ClienteFilter } from '../types/cliente.types';
import type { PaginationOptions } from '../types/vehiculo.types';
import type { PaginatedResponse } from '../types/api.types';

export const clientesApi = {
    getAll: (filters: ClienteFilter = {}, options: PaginationOptions = {}) => {
        return client.get<PaginatedResponse<Cliente>>('/clientes', {
            params: { ...filters, ...options },
        });
    },

    getById: (id: number) => {
        return client.get<Cliente>(`/clientes/${id}`);
    },

    create: (data: Partial<Cliente>) => {
        return client.post<Cliente>('/clientes', data);
    },

    update: (id: number, data: Partial<Cliente>) => {
        return client.patch<Cliente>(`/clientes/${id}`, data);
    },

    delete: (id: number) => {
        return client.delete<void>(`/clientes/${id}`);
    },
};
