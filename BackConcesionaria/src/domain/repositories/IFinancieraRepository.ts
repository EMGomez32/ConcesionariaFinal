import { Financiera } from '../entities/Financiera';

export interface IFinancieraRepository {
    findAll(concesionariaId: number): Promise<Financiera[]>;
    findById(id: number): Promise<Financiera | null>;
    create(data: any): Promise<Financiera>;
    update(id: number, data: any): Promise<Financiera>;
    delete(id: number): Promise<void>;
    countSolicitudes(id: number): Promise<number>;
}
