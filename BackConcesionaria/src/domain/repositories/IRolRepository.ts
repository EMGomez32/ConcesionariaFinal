import { Rol } from '../entities/Rol';

export interface IRolRepository {
    findAll(): Promise<Rol[]>;
    findById(id: number): Promise<Rol | null>;
}
