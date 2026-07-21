import { Venta } from '../entities/Venta';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IVentaRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<Venta>>;
    findById(id: number): Promise<Venta | null>;
    create(data: any): Promise<Venta>;
    update(id: number, data: any): Promise<Venta>;
    delete(id: number): Promise<void>;

    // Custom methods for transactions
    createWithTransaction(data: any, tx: any): Promise<Venta>;

    // Sub-resources: pagos
    listPagos(ventaId: number): Promise<any[]>;
    addPago(ventaId: number, data: any): Promise<any>;
    removePago(pagoId: number): Promise<void>;

    // Sub-resources: extras
    listExtras(ventaId: number): Promise<any[]>;
    addExtra(ventaId: number, data: any): Promise<any>;
    removeExtra(extraId: number): Promise<void>;

    // Sub-resources: canjes
    listCanjes(ventaId: number): Promise<any[]>;
    addCanje(ventaId: number, data: any): Promise<any>;
    removeCanje(canjeId: number): Promise<void>;
}
