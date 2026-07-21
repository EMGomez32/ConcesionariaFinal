import { Presupuesto } from '../entities/Presupuesto';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IPresupuestoRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<Presupuesto>>;
    findById(id: number): Promise<Presupuesto | null>;
    create(data: any): Promise<Presupuesto>;
    update(id: number, data: any): Promise<Presupuesto>;
    delete(id: number): Promise<void>;
    /** Cuenta presupuestos por año en una concesionaria — para generar nroPresupuesto */
    countByYearAndConcesionaria(year: number, concesionariaId: number): Promise<number>;
}
