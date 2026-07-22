import client from './client';
import type { Venta, EstadoEntrega } from '../types/venta.types';
import type { PaginationOptions } from '../types/vehiculo.types';
import type { PaginatedResponse } from '../types/api.types';

export interface CreateVentaDto {
    sucursalId: number;
    clienteId: number;
    vendedorId: number;
    vehiculoId: number;
    presupuestoId?: number;
    reservaId?: number;
    precioVenta: number;
    moneda: 'ARS' | 'USD';
    formaPago: 'contado' | 'transferencia' | 'financiado_propio' | 'financiado_externo' | 'canje_mas_diferencia' | 'mixto';
    fechaVenta: string;
    observaciones?: string;
    pagos?: { monto: number; metodo: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'otro'; referencia?: string; observaciones?: string }[];
    externos?: { descripcion: string; monto: number; comprobanteUrl?: string }[];
    canjes?: { vehiculoCanjeId: number; valorTomado: number }[];
}

export interface VentaFilters {
    sucursalId?: number;
    clienteId?: number;
    vendedorId?: number;
    vehiculoId?: number;
    estadoEntrega?: string;
    formaPago?: string;
    fechaDesde?: string;
    fechaHasta?: string;
}

export const ventasApi = {
    getAll: (filters: VentaFilters = {}, options: PaginationOptions = {}) => {
        return client.get<PaginatedResponse<Venta>>('/ventas', {
            params: { ...filters, ...options },
        });
    },

    getById: (id: number) => {
        return client.get<Venta>(`/ventas/${id}`);
    },

    create: (data: CreateVentaDto) => {
        return client.post<Venta>('/ventas', data);
    },

    update: (id: number, data: { observaciones?: string }) => {
        return client.patch<Venta>(`/ventas/${id}`, data);
    },

    // Cambio de estado de logística: endpoint dedicado que valida la transición
    // (state machine) y setea fechaEntrega al entregar. El endpoint genérico
    // /ventas/:id (update) descarta estadoEntrega a propósito.
    changeEstadoEntrega: (id: number, estadoEntrega: EstadoEntrega) => {
        return client.patch<Venta>(`/ventas/${id}/estado-entrega`, { estadoEntrega });
    },

    delete: (id: number) => {
        return client.delete<void>(`/ventas/${id}`);
    },

    // Comprobante de venta en PDF (Blob descargable).
    comprobantePdf: (id: number) =>
        client.get<Blob>(`/ventas/${id}/comprobante`, { responseType: 'blob' }),
};
