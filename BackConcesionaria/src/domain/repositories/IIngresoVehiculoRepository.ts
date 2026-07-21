import { IngresoVehiculo } from '../entities/IngresoVehiculo';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IIngresoVehiculoRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<IngresoVehiculo>>;
    findById(id: number): Promise<IngresoVehiculo | null>;
    create(data: any): Promise<IngresoVehiculo>;
    delete(id: number): Promise<void>;
}
