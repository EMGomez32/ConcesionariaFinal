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

// Simulador: calcula el plan sin persistir. Sólo requiere monto + cuotas; el resto
// es opcional (fecha/día sólo cambian las fechas de vencimiento, no los montos).
export interface SimularFinanciacionDto {
    montoFinanciado: number;
    cuotas: number;
    tasaMensual?: number;
    moneda?: 'ARS' | 'USD';
    fechaInicio?: string;
    diaVencimiento?: number;
}

export interface CuotaSimulada {
    nroCuota: number;
    montoCuota: number;
    saldoCuota: number;
    vencimiento: string;
    estado: string;
}

export interface SimulacionResult {
    resumen: {
        montoFinanciado: number;
        cuotas: number;
        tasaMensual: number;
        moneda: string;
        /** Valor de la primera cuota (las demás pueden diferir en 1 centavo). */
        valorCuota: number;
        totalAPagar: number;
        /** Interés total = totalAPagar − montoFinanciado. */
        costoFinanciero: number;
        fechaInicio: string;
        diaVencimiento: number;
    };
    cuotas: CuotaSimulada[];
}

export interface PagarCuotaDto {
    monto: number;
    metodo: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'otro';
    referencia?: string;
    observaciones?: string;
    fechaPago?: string;
    /**
     * Clave de idempotencia por intento de cobro (se genera al abrir el modal).
     * El backend la usa para no duplicar el pago ante un reenvío (doble-submit /
     * retry de red): un segundo request con la misma clave no crea otro PagoCuota.
     */
    idempotencyKey?: string;
}

export const financiacionesApi = {
    getAll: (filters: Record<string, unknown> = {}, options: PaginationOptions = {}) =>
        client.get('/financiaciones', { params: { ...filters, ...options } }),

    getById: (id: number) =>
        client.get(`/financiaciones/${id}`),

    create: (data: CreateFinanciacionDto) =>
        client.post('/financiaciones', data),

    /** Simula el plan de cuotas (no persiste). Misma amortización que el alta real. */
    simular: (data: SimularFinanciacionDto) =>
        client.post<SimulacionResult>('/financiaciones/simular', data),

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

    /** Recibo de pago de una cuota en PDF (blob descargable). */
    reciboCuotaPdf: (cuotaId: number) =>
        client.get<Blob>(`/financiaciones/cuotas/${cuotaId}/recibo`, { responseType: 'blob' }),
};
