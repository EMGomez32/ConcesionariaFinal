import { MetaVenta } from '../entities/MetaVenta';

export interface IMetaVentaRepository {
    /** La meta de un período (o null si no se cargó ninguna para ese mes). */
    findByPeriodo(anio: number, mes: number, concesionariaId?: number): Promise<MetaVenta | null>;
    /** Carga la meta de un mes: crea o pisa la de ese período (upsert por período). */
    upsertByPeriodo(data: any): Promise<MetaVenta>;
    delete(id: number): Promise<void>;
}
