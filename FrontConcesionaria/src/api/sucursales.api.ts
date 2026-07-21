import client from './client';
import type { SucursalFilter, CreateSucursalDto, UpdateSucursalDto } from '../types/sucursal.types';
import type { PaginationOptions } from '../types/vehiculo.types';

export const sucursalesApi = {
    getAll: (filters: SucursalFilter = {}, options: PaginationOptions = {}) => {
        return client.get('/sucursales', {
            params: { ...filters, ...options },
        });
    },

    getById: (id: number) => {
        return client.get(`/sucursales/${id}`);
    },

    create: (data: CreateSucursalDto) => {
        return client.post('/sucursales', data);
    },

    update: (id: number, data: UpdateSucursalDto) => {
        return client.patch(`/sucursales/${id}`, data);
    },

    delete: (id: number) => {
        return client.delete(`/sucursales/${id}`);
    },
};
