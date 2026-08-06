import { VehiculoPrecioHistorial } from '../entities/VehiculoPrecioHistorial';

export interface IVehiculoPrecioHistorialRepository {
    /** Historial de precios de lista de un vehículo (más reciente primero). */
    findByVehiculo(vehiculoId: number): Promise<VehiculoPrecioHistorial[]>;
}
