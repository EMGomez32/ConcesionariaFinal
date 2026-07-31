import client from './client';

// Objetivos mensuales por vendedor (complemento de la meta a nivel tenant y del
// ranking/comisiones). El backend devuelve, por cada vendedor con objetivo, sus
// metas de unidades y/o facturado y el avance real de sus ventas del mes.

export interface ObjetivoVendedorItem {
    /** Id del objetivo (para editar/eliminar). */
    id: number;
    vendedorId: number;
    vendedor: string;
    moneda: string;
    /** null si no se fijó objetivo de unidades. */
    unidadesObjetivo: number | null;
    unidadesReal: number;
    /** % de avance (sin tope), o null si no hay objetivo de unidades. */
    unidadesPct: number | null;
    /** null si no se fijó objetivo de facturado. */
    montoObjetivo: number | null;
    montoReal: number;
    /** % de avance (sin tope), o null si no hay objetivo de facturado. */
    montoPct: number | null;
}

export interface ReporteObjetivos {
    periodo: { anio: number; mes: number };
    items: ObjetivoVendedorItem[];
    resumen: { vendedores: number };
}

export interface UpsertObjetivoInput {
    vendedorId: number;
    anio: number;
    mes: number;
    unidadesObjetivo?: number | null;
    montoObjetivo?: number | null;
    moneda?: 'ARS' | 'USD';
}

export const objetivosApi = {
    /** Objetivos del período con progreso. Por defecto, el mes actual. */
    getAll: (anio?: number, mes?: number) =>
        client.get<ReporteObjetivos>('/objetivos-vendedor', { params: { anio, mes } }),

    /** Fija (o pisa) el objetivo de un vendedor en un mes. Solo admin. */
    upsert: (data: UpsertObjetivoInput) =>
        client.post<ObjetivoVendedorItem>('/objetivos-vendedor', data),

    delete: (id: number) =>
        client.delete<void>(`/objetivos-vendedor/${id}`),
};
