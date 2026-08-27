import { api } from './client';

/**
 * API de Atenciones (el Mostrador del vendedor). Espejo de los endpoints del
 * backend; acá sólo tipamos lo que la app consume. Se irá ampliando por pantalla.
 */

export type EstadoAtencion = 'abierta' | 'cerrada';
export type ResultadoAtencion =
    | 'reserva' | 'sin_unidad' | 'cotizacion' | 'test_drive'
    | 'permuta_a_tasar' | 'en_analisis' | 'se_retiro';
export type MotivoAtencion =
    | 'consulta_general' | 'unidad_puntual' | 'vuelve_por_atencion_anterior';

export interface ClienteMini {
    id: number;
    nombre: string;
    apellido?: string | null;
    telefono?: string | null;
}

export interface AtencionListItem {
    id: number;
    estado: EstadoAtencion;
    motivo: MotivoAtencion;
    resultado?: ResultadoAtencion | null;
    iniciadaEn: string;
    cerradaEn?: string | null;
    cerradaAutomaticamente?: boolean;
    cliente?: ClienteMini | null;
    vendedor?: { id: number; nombre: string } | null;
}

export interface ListadoAtenciones {
    results: AtencionListItem[];
    page: number;
    limit: number;
    totalPages: number;
    totalResults: number;
}

export interface AlertaAtenciones {
    abiertas: number;
    cerradasPorSistema: number;
    alcance: 'vendedor' | 'tenant';
    deJornadasAnteriores: number;
    detalle: { id: number; iniciadaEn: string; motivo: MotivoAtencion; cliente?: ClienteMini | null }[];
}

export interface AtencionFilter {
    estado?: EstadoAtencion;
    vendedorId?: number;
}

export const atencionesApi = {
    list: (filters: AtencionFilter = {}, page = 1, limit = 20) =>
        api.get<ListadoAtenciones>('/atenciones', { params: { ...filters, page, limit } }).then((r) => r.data),

    alertas: () =>
        api.get<AlertaAtenciones>('/atenciones/alertas').then((r) => r.data),

    getById: (id: number) =>
        api.get(`/atenciones/${id}`).then((r) => r.data),
};

/** Etiquetas legibles. */
export const MOTIVO_LABEL: Record<MotivoAtencion, string> = {
    consulta_general: 'Consulta general',
    unidad_puntual: 'Vino por una unidad puntual',
    vuelve_por_atencion_anterior: 'Vuelve por una visita anterior',
};

export const RESULTADO_LABEL: Record<ResultadoAtencion, string> = {
    reserva: 'Reserva / seña tomada',
    sin_unidad: 'No hay unidad que le sirva',
    cotizacion: 'Cotización entregada',
    test_drive: 'Test drive realizado',
    permuta_a_tasar: 'Permuta enviada a tasar',
    en_analisis: 'En análisis',
    se_retiro: 'Se retiró sin definir',
};
