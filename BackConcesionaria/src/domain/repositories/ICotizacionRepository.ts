import { Cotizacion } from '../entities/Cotizacion';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface ICotizacionRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<Cotizacion>>;
    findById(id: number): Promise<Cotizacion | null>;
    /** La cotización de una fecha puntual (o null si ese día no tiene carga). */
    findByFecha(fecha: Date, concesionariaId?: number): Promise<Cotizacion | null>;
    /** La cotización vigente a una fecha: la más reciente con fecha <= la dada.
     *  Sin `fecha` devuelve la última cargada. */
    findVigente(fecha?: Date, concesionariaId?: number): Promise<Cotizacion | null>;
    /** Carga la cotización de un día: crea o pisa la de esa fecha (upsert por fecha). */
    upsertByFecha(data: any): Promise<Cotizacion>;
    delete(id: number): Promise<void>;
}
