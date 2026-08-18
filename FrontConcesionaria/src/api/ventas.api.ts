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

    // ── Facturación electrónica AFIP ─────────────────────────────────────────
    // Emite la factura (obtiene el CAE). Idempotente: si ya se facturó devuelve 409
    // con error 'COMPROBANTE_YA_EMITIDO'.
    emitirFactura: (id: number) =>
        client.post<ComprobanteAfip>(`/ventas/${id}/factura`),

    // Comprobante fiscal ya emitido de la venta (404 si no existe).
    getFactura: (id: number) =>
        client.get<ComprobanteAfip>(`/ventas/${id}/factura`),

    // Factura electrónica en PDF (Blob descargable) con CAE + QR.
    facturaPdf: (id: number) =>
        client.get<Blob>(`/ventas/${id}/factura/pdf`, { responseType: 'blob' }),
};

// Comprobante fiscal AFIP asociado a una venta.
export interface ComprobanteAfip {
    id: number;
    ventaId: number;
    tipoComprobante: 'factura_a' | 'factura_b' | 'factura_c';
    puntoVenta: number;
    numero: number;
    fechaComprobante: string;
    receptorNombre: string;
    receptorDocNro: string;
    moneda: string;
    neto: number;
    alicuotaIva: number;
    iva: number;
    total: number;
    estado: 'pendiente' | 'emitida' | 'error';
    entorno: 'mock' | 'homologacion' | 'produccion';
    cae: string | null;
    caeVencimiento: string | null;
}
