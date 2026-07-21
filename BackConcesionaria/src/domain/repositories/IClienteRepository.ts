import { Cliente } from '../entities/Cliente';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IClienteRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<Cliente>>;
    findById(id: number): Promise<Cliente | null>;
    create(data: Partial<Cliente>): Promise<Cliente>;
    update(id: number, data: Partial<Cliente>): Promise<Cliente>;
    delete(id: number): Promise<void>;
    countVentas(id: number): Promise<number>;
    countPresupuestos(id: number): Promise<number>;
}
