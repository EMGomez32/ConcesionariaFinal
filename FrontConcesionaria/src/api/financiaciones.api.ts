import client from './client';
import type { PaginationOptions } from '../types/vehiculo.types';

export interface CreateFinanciacionDto {
    ventaId: number;
    clienteId: number;
    cobradorId?: number;
    fechaInicio: string;
    montoFinanciado: number;
    moneda?: 'ARS' | 'USD';
    cuotas: number;
    diaVencimiento: number;
    tasaMensual?: number;
    observaciones?: string;
}

export interface PagarCuotaDto {
    monto: number;
    metodo: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'otro';
    referencia?: string;
    observaciones?: string;
    fechaPago?: string;
}

export const financiacionesApi = {
    getAll: (filters: Record<string, unknown> = {}, options: PaginationOptions = {}) =>
        client.get('/financiaciones', { params: { ...filters, ...options } }),

    getById: (id: number) =>
        client.get(`/financiaciones/${id}`),

    create: (data: CreateFinanciacionDto) =>
        client.post('/financiaciones', data),

    /**
     * Refinancia el saldo pendiente en un contrato nuevo.
     * El monto NO se manda: el backend lo deriva del saldo real de las cuotas.
     */
    refinanciar: (id: number, data: {
        cuotas: number;
        fechaInicio?: string;
        tasaMensual?: number;
        diaVencimiento?: number;
        cobradorId?: number;
        observaciones?: string;
    }) => client.post(`/financiaciones/${id}/refinanciar`, data),

    updateEstado: (id: number, estado: string) =>
        client.patch(`/financiaciones/${id}`, { estado }),

    delete: (id: number) =>
        client.delete(`/financiaciones/${id}`),

    pagarCuota: (cuotaId: number, data: PagarCuotaDto) =>
        client.patch(`/financiaciones/cuotas/${cuotaId}/pagar`, data),
};
