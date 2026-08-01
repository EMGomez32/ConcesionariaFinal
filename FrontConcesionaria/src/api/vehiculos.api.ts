import client from './client';
import type { Vehiculo, VehiculoFilter, PaginationOptions, EstadoVehiculo } from '../types/vehiculo.types';
import type { PaginatedResponse } from '../types/api.types';

export const vehiculosApi = {
    getAll: (filters: VehiculoFilter = {}, options: PaginationOptions = {}) => {
        // `estado` puede venir como array: el backend lo espera separado por coma
        // (axios serializaría un array como estado[]=a&estado[]=b).
        const { estado, ...resto } = filters;
        const params: Record<string, unknown> = { ...resto, ...options };
        if (estado) params.estado = Array.isArray(estado) ? estado.join(',') : estado;
        return client.get<PaginatedResponse<Vehiculo>>('/vehiculos', { params });
    },

    getById: (id: number) => {
        return client.get<Vehiculo>(`/vehiculos/${id}`);
    },

    create: (data: Partial<Vehiculo>) => {
        return client.post<Vehiculo>('/vehiculos', data);
    },

    update: (id: number, data: Partial<Vehiculo>) => {
        return client.patch<Vehiculo>(`/vehiculos/${id}`, data);
    },

    changeEstado: (id: number, estado: EstadoVehiculo) => {
        return client.patch<Vehiculo>(`/vehiculos/${id}`, { estado });
    },

    transferir: (vehiculoId: number, sucursalDestinoId: number, motivo?: string) => {
        return client.post<Vehiculo>(`/vehiculos/${vehiculoId}/transferir`, {
            sucursalDestinoId,
            motivo,
        });
    },

    delete: (id: number) => {
        return client.delete<void>(`/vehiculos/${id}`);
    },

    // Ficha del vehículo en PDF (de cara al cliente), con la marca del tenant.
    fichaPdf: (id: number) =>
        client.get<Blob>(`/vehiculos/${id}/ficha`, { responseType: 'blob' }),

    // Catálogo de vehículos en PDF (grilla), con los MISMOS filtros que el listado.
    // Mismo criterio que getAll para `estado`: se serializa separado por coma.
    catalogoPdf: (filters: VehiculoFilter = {}, options: PaginationOptions = {}) => {
        const { estado, ...resto } = filters;
        const params: Record<string, unknown> = { ...resto, ...options };
        if (estado) params.estado = Array.isArray(estado) ? estado.join(',') : estado;
        return client.get<Blob>('/vehiculos/catalogo/pdf', { params, responseType: 'blob' });
    },
};
