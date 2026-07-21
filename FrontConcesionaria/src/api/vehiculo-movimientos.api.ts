import client from './client';

export interface VehiculoMovimiento {
    id: number;
    vehiculoId: number;
    desdeSucursalId?: number;
    hastaSucursalId: number;
    tipo: string;
    motivo?: string;
    /** Proveedor externo al que se envió la unidad (preparación). */
    proveedorDestinoId?: number | null;
    /** Destino en texto libre de movimientos históricos. No se escribe más. */
    destino?: string;
    fecha?: string;
    fechaRetorno?: string | null;
    concesionariaId?: number;
    createdAt?: string;
    vehiculo?: { id: number; marca: string; modelo: string; dominio?: string };
    desdeSucursal?: { id: number; nombre: string };
    hastaSucursal?: { id: number; nombre: string };
    proveedorDestino?: { id: number; nombre: string; tipo?: string };
    registradoPor?: { nombre: string; email: string };
}

export interface MovimientoFilter {
    vehiculoId?: number;
    desdeSucursalId?: number;
    hastaSucursalId?: number;
    page?: number;
    limit?: number;
}

export const vehiculoMovimientosApi = {
    getAll: (filters: MovimientoFilter = {}) =>
        client.get('/vehiculo-movimientos', { params: filters }),

    create: (data: {
        vehiculoId: number;
        tipo?: 'traslado' | 'preparacion';
        hastaSucursalId?: number;
        /** Requerido cuando tipo = 'preparacion': a qué proveedor va la unidad. */
        proveedorDestinoId?: number;
        motivo?: string;
        fechaMovimiento?: string;
    }) =>
        client.post('/vehiculo-movimientos', data),

    marcarRetorno: (id: number) =>
        client.patch(`/vehiculo-movimientos/${id}/retorno`, {}),
};
