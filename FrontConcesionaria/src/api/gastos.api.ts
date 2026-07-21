import client from './client';
import type { PaginatedResponse } from '../types/api.types';

export type TipoGasto = 'VEHICULO' | 'FIJO';
export type MonedaGasto = 'ARS' | 'USD';

export interface GastoVehiculo {
    id: number;
    monto: number;
    moneda: MonedaGasto;
    tipo: TipoGasto;
    categoriaId: number;
    vehiculoId?: number;
    /** Derivado del vehículo por el backend: no se envía al crear. */
    sucursalId?: number;
    concesionariaId?: number;
    fechaGasto: string;
    descripcion?: string;
    proveedorId?: number;
    urlComprobante?: string;
    createdAt?: string;
    updatedAt?: string;
    categoria?: { id: number; nombre: string };
    vehiculo?: { id: number; marca: string; modelo: string; dominio?: string };
    sucursal?: { id: number; nombre: string };
    proveedor?: { id: number; nombre: string };
}

export interface GastoFilter {
    tipo?: TipoGasto;
    categoriaId?: number;
    vehiculoId?: number;
    sucursalId?: number;
    descripcion?: string;
    page?: number;
    limit?: number;
}

export const gastosApi = {
    getAll: (filters: GastoFilter = {}) =>
        client.get<PaginatedResponse<GastoVehiculo>>('/gastos', { params: filters }),

    create: (data: {
        vehiculoId: number;
        categoriaId: number;
        monto: number;
        moneda: MonedaGasto;
        fechaGasto: string;
        descripcion?: string;
        proveedorId?: number;
        tipo?: TipoGasto;
    }) => client.post<GastoVehiculo>('/gastos', data),

    update: (id: number, data: { monto?: number; descripcion?: string; fechaGasto?: string }) =>
        client.patch<GastoVehiculo>(`/gastos/${id}`, data),

    delete: (id: number) =>
        client.delete<void>(`/gastos/${id}`),
};
