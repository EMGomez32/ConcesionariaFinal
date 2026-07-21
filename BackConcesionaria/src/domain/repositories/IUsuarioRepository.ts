import { Usuario } from '../entities/Usuario';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IUsuarioRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<Usuario>>;
    findById(id: number): Promise<Usuario | null>;
    findByEmail(email: string): Promise<Usuario | null>;
    findByEmailInConcesionaria(email: string, concesionariaId: number): Promise<Usuario | null>;
    create(data: any): Promise<Usuario>;
    update(id: number, data: any): Promise<Usuario>;
    delete(id: number): Promise<void>;
}
