import { Financiacion, Cuota } from '../entities/Financiacion';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IFinanciacionRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<Financiacion>>;
    findById(id: number): Promise<Financiacion | null>;
    create(data: any): Promise<Financiacion>;
    update(id: number, data: any): Promise<Financiacion>;
    /** Cierra el contrato `id` y crea uno nuevo por su saldo pendiente. */
    refinanciar(id: number, data: any): Promise<Financiacion>;

    // Custom methods for sub-entities or transactions
    findCuotaById(id: number): Promise<Cuota | null>;
    updateCuota(id: number, data: any): Promise<Cuota>;
    createPagoCuota(data: any): Promise<void>;
}
