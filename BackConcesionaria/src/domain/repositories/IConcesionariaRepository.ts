import { Concesionaria } from '../entities/Concesionaria';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IConcesionariaRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<Concesionaria>>;
    findById(id: number): Promise<Concesionaria | null>;
    create(data: Partial<Concesionaria>): Promise<Concesionaria>;
    update(id: number, data: Partial<Concesionaria>): Promise<Concesionaria>;
    delete(id: number): Promise<void>;
    countActiveSucursales(id: number): Promise<number>;
    countActiveUsuarios(id: number): Promise<number>;
    countActiveVehiculos(id: number): Promise<number>;
}
