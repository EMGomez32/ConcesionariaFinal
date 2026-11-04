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
    /**
     * Búsqueda en el servidor (contrato 1): nombre/DNI del cliente, dominio/marca/
     * modelo del vehículo y número de venta. Reemplaza el filtrado de la página en memoria.
     */
    q?: string;
    sucursalId?: number;
    clienteId?: number;
    vendedorId?: number;
    vehiculoId?: number;
    estadoEntrega?: string;
    formaPago?: string;
    /** `fechaVenta` desde (inclusive), YYYY-MM-DD (contrato 2). */
    fechaDesde?: string;
    /** `fechaVenta` hasta (inclusive), YYYY-MM-DD (contrato 2). */
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
    // `motivo` es obligatorio para `cancelada` (anular la operación): el backend lo
    // rechaza con 400 si falta. Para avanzar la entrega no se manda.
    changeEstadoEntrega: (id: number, estadoEntrega: EstadoEntrega, motivo?: string) => {
        return client.patch<Venta>(`/ventas/${id}/estado-entrega`, { estadoEntrega, ...(motivo ? { motivo } : {}) });
    },

    // ANULAR la venta (soft-delete, sólo admin). El motivo es obligatorio (mínimo 10
    // caracteres) y viaja en el body del DELETE. Si quedan pagos, una financiación o
    // una factura informada a AFIP, el backend responde 409 ANULACION_BLOQUEADA con
    // el detalle de qué revertir antes.
    delete: (id: number, motivo: string) => {
        return client.delete<void>(`/ventas/${id}`, { data: { motivo } });
    },

    // Reporte de anulaciones (sólo admin): qué se anuló, cuándo, quién y por qué.
    anuladas: (options: PaginationOptions = {}) => {
        return client.get<PaginatedResponse<VentaAnulada>>('/ventas/anuladas', { params: options });
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

/** Una fila del reporte de anulaciones (GET /ventas/anuladas). */
export interface VentaAnulada {
    id: number;
    fechaVenta: string;
    precioVenta: number | string;
    moneda: string;
    formaPago: string;
    estadoEntrega: EstadoEntrega;
    motivoAnulacion: string | null;
    anuladaEn: string;
    cliente?: { id: number; nombre: string; dni?: string | null } | null;
    vehiculo?: { id: number; marca?: string; modelo?: string; dominio?: string | null } | null;
    vendedor?: { id: number; nombre: string } | null;
    anuladaPor?: { id: number; nombre: string } | null;
}

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
