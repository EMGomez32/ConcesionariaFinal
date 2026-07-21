import client from './client';
import type { Proveedor, ProveedorFilter } from '../types/proveedor.types';
import type { PaginatedResponse } from '../types/api.types';
import type { PaginationOptions } from '../types/common.types';

export const proveedoresApi = {
    getAll: (filters: ProveedorFilter = {}, options: PaginationOptions = {}) => {
        return client.get<PaginatedResponse<Proveedor>>('/proveedores', {
            params: { ...filters, ...options }
        });
    },

    getById: (id: number) => {
        return client.get<Proveedor>(`/proveedores/${id}`);
    },

    create: (data: Partial<Proveedor>) => {
        return client.post<Proveedor>('/proveedores', data);
    },

    update: (id: number, data: Partial<Proveedor>) => {
        return client.patch<Proveedor>(`/proveedores/${id}`, data);
    },

    delete: (id: number) => {
        return client.delete<void>(`/proveedores/${id}`);
    },
};
