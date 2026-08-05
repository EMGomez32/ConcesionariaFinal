import { Tasacion } from '../entities/Tasacion';
import { QueryOptions, PaginatedResponse } from '../../types/common';

export interface ITasacionRepository {
    findAll(filter: any, options: QueryOptions): Promise<PaginatedResponse<Tasacion>>;
    findById(id: number): Promise<Tasacion | null>;
    create(data: any): Promise<Tasacion>;
    delete(id: number): Promise<void>;
}
