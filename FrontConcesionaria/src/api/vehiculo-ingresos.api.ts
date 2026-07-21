import client from './client';

export type TipoIngreso = 'compra_proveedor' | 'compra_particular' | 'permuta' | 'consignacion' | 'otro';

export interface IngresoVehiculo {
    id: number;
    vehiculoId: number;
    sucursalId: number;
    tipoIngreso: TipoIngreso;
    fechaIngreso: string;
    valorTomado?: number;
    observaciones?: string;
    clienteOrigenId?: number;
    proveedorOrigenId?: number;
    presupuestoId?: number;
    ventaId?: number;
    concesionariaId?: number;
    createdAt?: string;
    vehiculo?: { id: number; marca: string; modelo: string; dominio?: string };
    sucursal?: { id: number; nombre: string };
    clienteOrigen?: { id: number; nombre: string };
    proveedorOrigen?: { id: number; nombre: string };
    registradoPor?: { nombre: string; email: string };
}

export interface IngresoFilter {
    tipoIngreso?: TipoIngreso;
    sucursalId?: number;
    vehiculoId?: number;
    page?: number;
    limit?: number;
}

export const vehiculoIngresosApi = {
    getAll: (filters: IngresoFilter = {}) =>
        client.get('/vehiculo-ingresos', { params: filters }),

    getById: (id: number) =>
        client.get(`/vehiculo-ingresos/${id}`),

    create: (data: Partial<IngresoVehiculo>) =>
        client.post('/vehiculo-ingresos', data),

    delete: (id: number) =>
        client.delete(`/vehiculo-ingresos/${id}`),
};
