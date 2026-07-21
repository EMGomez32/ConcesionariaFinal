import { Reserva } from '../entities/Reserva';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IReservaRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<Reserva>>;
    findById(id: number): Promise<Reserva | null>;
    create(data: any): Promise<Reserva>;
    update(id: number, data: any): Promise<Reserva>;
    delete(id: number): Promise<void>;
}
