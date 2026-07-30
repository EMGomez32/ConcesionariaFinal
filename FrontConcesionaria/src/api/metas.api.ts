import client from './client';

export interface MetaVenta {
    id: number;
    anio: number;
    mes: number;
    /** Objetivo de unidades (o null si no se fijó). */
    unidadesObjetivo: number | null;
    /** Objetivo de facturado (o null si no se fijó). */
    montoObjetivo: number | null;
    moneda: string;
}

export const metasApi = {
    /** La meta de un mes (o null). Por defecto, el mes actual. */
    actual: (anio?: number, mes?: number) =>
        client.get<MetaVenta | null>('/metas/actual', { params: { anio, mes } }),

    /** Fija (o pisa) la meta de un mes. Solo admin. */
    upsert: (data: { anio: number; mes: number; unidadesObjetivo?: number | null; montoObjetivo?: number | null; moneda?: 'ARS' | 'USD' }) =>
        client.post<MetaVenta>('/metas', data),

    delete: (id: number) =>
        client.delete<void>(`/metas/${id}`),
};
