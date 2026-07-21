import { Sucursal } from '../entities/Sucursal';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface ISucursalRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<Sucursal>>;
    findById(id: number): Promise<Sucursal | null>;
    create(data: Partial<Sucursal>): Promise<Sucursal>;
    update(id: number, data: Partial<Sucursal>): Promise<Sucursal>;
    delete(id: number): Promise<void>;
    /** Relaciones vivas que cuelgan de la sucursal (para bloquear el borrado). */
    countRelaciones(id: number): Promise<{ etiqueta: string; cantidad: number }[]>;
}
