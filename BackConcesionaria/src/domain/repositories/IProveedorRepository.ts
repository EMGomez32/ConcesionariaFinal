import { Proveedor } from '../entities/Proveedor';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IProveedorRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<Proveedor>>;
    findById(id: number): Promise<Proveedor | null>;
    create(data: Partial<Proveedor>): Promise<Proveedor>;
    update(id: number, data: Partial<Proveedor>): Promise<Proveedor>;
    delete(id: number): Promise<void>;
    countGastos(id: number): Promise<number>;
    countPostventaItems(id: number): Promise<number>;
}
