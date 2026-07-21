import { CategoriaGastoFijo } from '../entities/CategoriaGastoFijo';

export interface ICategoriaGastoFijoRepository {
    findAll(concesionariaId: number): Promise<CategoriaGastoFijo[]>;
    findById(id: number): Promise<CategoriaGastoFijo | null>;
    create(data: any): Promise<CategoriaGastoFijo>;
    update(id: number, data: any): Promise<CategoriaGastoFijo>;
    delete(id: number): Promise<void>;
    countGastosFijos(id: number): Promise<number>;
}
