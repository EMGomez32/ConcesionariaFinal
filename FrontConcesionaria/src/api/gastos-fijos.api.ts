import client from './client';

export interface GastoFijo {
    id: number;
    categoriaId: number;
    sucursalId?: number | null;
    proveedorId?: number | null;
    concesionariaId?: number;
    anio: number;
    mes: number;
    monto: number | string;
    /** ARS por defecto. Los totales se agrupan por moneda: sumar ARS con USD no significa nada. */
    moneda?: 'ARS' | 'USD';
    descripcion: string;
    comprobanteUrl?: string | null;
    createdAt?: string;
    updatedAt?: string;
    categoria?: { id: number; nombre: string };
    sucursal?: { id: number; nombre: string };
    proveedor?: { id: number; nombre: string };
}

export interface GastoFijoFilter {
    categoriaId?: number;
    sucursalId?: number;
    anio?: number;
    mes?: number;
    page?: number;
    limit?: number;
}

export const gastosFijosApi = {
    getAll: (filters: GastoFijoFilter = {}) =>
        client.get('/gastos-fijos', { params: filters }),
    create: (data: Partial<GastoFijo>) =>
        client.post('/gastos-fijos', data),
    update: (id: number, data: Partial<GastoFijo>) =>
        client.patch(`/gastos-fijos/${id}`, data),
    delete: (id: number) =>
        client.delete(`/gastos-fijos/${id}`),
};
