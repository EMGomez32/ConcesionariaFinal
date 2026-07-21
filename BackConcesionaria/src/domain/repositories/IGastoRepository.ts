import { Gasto } from '../entities/Gasto';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IGastoRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<Gasto>>;
    findById(id: number): Promise<Gasto | null>;
    create(data: any): Promise<Gasto>;
    update(id: number, data: any): Promise<Gasto>;
    delete(id: number): Promise<void>;
}
