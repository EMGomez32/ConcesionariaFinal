import { GastoFijo } from '../entities/GastoFijo';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IGastoFijoRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<GastoFijo>>;
    findById(id: number): Promise<GastoFijo | null>;
    create(data: any): Promise<GastoFijo>;
    update(id: number, data: any): Promise<GastoFijo>;
    delete(id: number): Promise<void>;
}
