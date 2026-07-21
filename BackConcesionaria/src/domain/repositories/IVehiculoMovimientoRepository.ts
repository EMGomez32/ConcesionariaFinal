import { VehiculoMovimiento } from '../entities/VehiculoMovimiento';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IVehiculoMovimientoRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<VehiculoMovimiento>>;
    findById(id: number): Promise<VehiculoMovimiento | null>;
    create(data: any): Promise<VehiculoMovimiento>;
    marcarRetorno(id: number, fecha?: string): Promise<VehiculoMovimiento>;
}
