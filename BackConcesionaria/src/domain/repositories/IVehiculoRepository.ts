import { Vehiculo } from '../entities/Vehiculo';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IVehiculoRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<Vehiculo>>;
    findById(id: number): Promise<Vehiculo | null>;
    create(data: Partial<Vehiculo>): Promise<Vehiculo>;
    update(id: number, data: Partial<Vehiculo>): Promise<Vehiculo>;
    delete(id: number): Promise<void>;
    countVentas(id: number): Promise<number>;
    countReservasActivas(id: number): Promise<number>;
}
