import { ObjetivoVendedor } from '../entities/ObjetivoVendedor';

export interface IObjetivoVendedorRepository {
    /** Todos los objetivos fijados para un período (uno por vendedor, a lo sumo). */
    findByPeriodo(anio: number, mes: number, concesionariaId?: number): Promise<ObjetivoVendedor[]>;
    /** El objetivo de un vendedor en un período (o null): locator del upsert. */
    findByVendedorPeriodo(vendedorId: number, anio: number, mes: number, concesionariaId?: number): Promise<ObjetivoVendedor | null>;
    /** Fija el objetivo de un vendedor en un mes: crea o pisa (upsert por período). */
    upsertByPeriodo(data: any): Promise<ObjetivoVendedor>;
    delete(id: number): Promise<void>;
}
