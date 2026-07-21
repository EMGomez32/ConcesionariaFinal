import { TipoPostventa } from '../entities/TipoPostventa';

export interface ITipoPostventaRepository {
    findAll(concesionariaId: number): Promise<TipoPostventa[]>;
    findById(id: number): Promise<TipoPostventa | null>;
    findByNombre(nombre: string): Promise<TipoPostventa | null>;
    create(data: any): Promise<TipoPostventa>;
    update(id: number, data: any): Promise<TipoPostventa>;
    delete(id: number): Promise<void>;
    countCasos(id: number): Promise<number>;
}
