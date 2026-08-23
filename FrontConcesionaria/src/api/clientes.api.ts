import client from './client';
import type { Cliente, ClienteFilter, OrigenLead } from '../types/cliente.types';
import type { PaginationOptions } from '../types/vehiculo.types';
import type { PaginatedResponse } from '../types/api.types';

export type { OrigenLead } from '../types/cliente.types';

/** Consulta entrante (lead) desde cualquier canal: mostrador, WhatsApp, web, etc. */
export interface ConsultaEntrante {
    origen: OrigenLead;
    nombre: string;
    telefono?: string;
    email?: string;
    /** Texto libre de la consulta (queda en las observaciones del cliente). */
    texto?: string;
    /** Vehículo puntual consultado (se registra como interés). */
    vehiculoId?: number;
    /** Vendedor elegido a mano; sin él, el backend asigna por round-robin. */
    vendedorId?: number;
}

/** Resultado del intake: a qué cliente quedó atada la consulta y quién la atiende. */
export interface ConsultaResultado {
    clienteId: number;
    /** true = se creó un cliente nuevo; false = dedupe contra uno existente. */
    creado: boolean;
    /** true = el lead estaba en etapa terminal y se reabrió como `nuevo`. */
    reabierto: boolean;
    vendedorAsignadoId: number | null;
}

export const clientesApi = {
    getAll: (filters: ClienteFilter = {}, options: PaginationOptions = {}) => {
        return client.get<PaginatedResponse<Cliente>>('/clientes', {
            params: { ...filters, ...options },
        });
    },

    // Intake de consultas: dedupe por teléfono/email, round-robin de vendedor y
    // reapertura de leads terminales los resuelve el backend.
    crearConsulta: (data: ConsultaEntrante) => {
        return client.post<ConsultaResultado>('/clientes/consulta', data);
    },

    getById: (id: number) => {
        return client.get<Cliente>(`/clientes/${id}`);
    },

    create: (data: Partial<Cliente>) => {
        return client.post<Cliente>('/clientes', data);
    },

    update: (id: number, data: Partial<Cliente>) => {
        return client.patch<Cliente>(`/clientes/${id}`, data);
    },

    delete: (id: number) => {
        return client.delete<void>(`/clientes/${id}`);
    },

    // Estado de cuenta del cliente en PDF (Blob descargable). admin/vendedor.
    estadoCuentaPdf: (id: number) =>
        client.get<Blob>(`/clientes/${id}/estado-cuenta/pdf`, { responseType: 'blob' }),

    // Export CSV de la cartera de clientes (respeta los mismos filtros del listado).
    // getRaw: conserva la respuesta completa para leer el header X-Export-Truncated.
    exportCsv: (filters: ClienteFilter = {}) =>
        client.getRaw<Blob>('/clientes/export/csv', { params: { ...filters }, responseType: 'blob' }),
};
