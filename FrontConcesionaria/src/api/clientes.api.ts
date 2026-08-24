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

/** Fila cruda de la importación masiva (planilla Excel/CSV ya mapeada en el front). */
export interface ImportClienteFila {
    nombre?: string;
    telefono?: string;
    email?: string;
    dni?: string;
    observaciones?: string;
    /** Canal ya normalizado a un OrigenLead; un valor fuera del enum es error de fila. */
    origenLead?: string;
    vendedorAsignadoId?: number;
}

export interface ImportClientesOpciones {
    /** Etapa de los clientes nuevos: cartera histórica ('contactado') o leads a trabajar ('nuevo'). */
    estadoInicial: 'contactado' | 'nuevo';
    /** Canal aplicado a las filas que no traen canal propio. */
    origenDefault?: string;
    /** true = completar SOLO los campos vacíos de clientes ya existentes (nunca pisa datos). */
    actualizarExistentes: boolean;
}

export interface ImportClientesResultado {
    creados: number;
    actualizados: number;
    salteados: number;
    /** `indice` = posición 0-based de la fila DENTRO del lote enviado. */
    errores: { indice: number; motivo: string }[];
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

    // Importación masiva desde planilla (lotes de 1 a 300 filas). Sólo admin.
    // La validación fina es POR FILA en el backend: una fila mala no aborta el lote.
    importar: (body: { filas: ImportClienteFila[]; opciones: ImportClientesOpciones }) =>
        client.post<ImportClientesResultado>('/clientes/import', body),

    // Estado de cuenta del cliente en PDF (Blob descargable). admin/vendedor.
    estadoCuentaPdf: (id: number) =>
        client.get<Blob>(`/clientes/${id}/estado-cuenta/pdf`, { responseType: 'blob' }),

    // Export CSV de la cartera de clientes (respeta los mismos filtros del listado).
    // getRaw: conserva la respuesta completa para leer el header X-Export-Truncated.
    exportCsv: (filters: ClienteFilter = {}) =>
        client.getRaw<Blob>('/clientes/export/csv', { params: { ...filters }, responseType: 'blob' }),
};
