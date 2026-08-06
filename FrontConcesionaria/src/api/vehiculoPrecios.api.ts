import client from './client';

/** Un registro del historial de precios de lista del vehículo (log append-only). */
export interface VehiculoPrecioHistorial {
    id: number;
    vehiculoId: number;
    precioAnterior?: number | null;
    precioNuevo: number;
    moneda: string;
    motivo?: string | null;
    usuarioId?: number | null;
    createdAt: string;
    usuario?: { id: number; nombre: string } | null;
}

export const vehiculoPreciosApi = {
    /** Historial de precios de lista de un vehículo (más reciente primero). */
    getByVehiculo: (vehiculoId: number) =>
        client.get<VehiculoPrecioHistorial[]>(`/vehiculo-precios/vehiculo/${vehiculoId}`),
};
