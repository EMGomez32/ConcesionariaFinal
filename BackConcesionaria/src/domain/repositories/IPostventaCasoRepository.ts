import { PostventaCaso } from '../entities/PostventaCaso';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IPostventaCasoRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<PostventaCaso>>;
    findById(id: number): Promise<PostventaCaso | null>;
    create(data: any): Promise<PostventaCaso>;
    update(id: number, data: any): Promise<PostventaCaso>;
    delete(id: number): Promise<void>;
}
