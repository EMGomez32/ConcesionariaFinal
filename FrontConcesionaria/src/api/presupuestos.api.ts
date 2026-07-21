import client from './client';
import type { PaginationOptions } from '../types/vehiculo.types';
import type { Presupuesto } from '../types/presupuesto.types';
import type { PaginatedResponse } from '../types/api.types';

export interface CreatePresupuestoDto {
    nroPresupuesto: string;
    sucursalId: number;
    clienteId: number;
    vendedorId: number;
    moneda: 'ARS' | 'USD';
    fechaCreacion: string;
    validoHasta?: string;
    observaciones?: string;
    items?: { vehiculoId: number; precioLista: number; descuento?: number; precioFinal: number }[];
    externos?: { descripcion: string; monto: number }[];
    canjes?: {
        descripcion?: string;
        anio?: number;
        km?: number;
        dominio?: string;
        valorTomado: number;
        observaciones?: string;
    };
}

export const presupuestosApi = {
    getAll: (filters: Record<string, unknown> = {}, options: PaginationOptions = {}) => {
        return client.get<PaginatedResponse<Presupuesto>>('/presupuestos', {
            params: { ...filters, ...options },
        });
    },

    getById: (id: number) => {
        return client.get<Presupuesto>(`/presupuestos/${id}`);
    },

    create: (data: CreatePresupuestoDto) => {
        return client.post<Presupuesto>('/presupuestos', data);
    },

    update: (id: number, data: { estado?: string; observaciones?: string }) => {
        return client.patch<Presupuesto>(`/presupuestos/${id}`, data);
    },

    delete: (id: number) => {
        return client.delete<void>(`/presupuestos/${id}`);
    },
};
