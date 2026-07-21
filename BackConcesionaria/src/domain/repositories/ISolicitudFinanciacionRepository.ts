import { SolicitudFinanciacion } from '../entities/SolicitudFinanciacion';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface ISolicitudFinanciacionRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<SolicitudFinanciacion>>;
    findById(id: number): Promise<SolicitudFinanciacion | null>;
    create(data: any): Promise<SolicitudFinanciacion>;
    update(id: number, data: any): Promise<SolicitudFinanciacion>;
    delete(id: number): Promise<void>;
}
