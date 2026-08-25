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
    /**
     * Los tres `remove*` reciben el ventaId del path ADEMÁS del id del sub-recurso:
     * borran sólo si el renglón pertenece a esa venta. Sin eso, `DELETE
     * /ventas/1/extras/777` borraba el extra 777 de CUALQUIER venta del tenant —
     * el `:id` de la venta viajaba en la URL y nadie lo miraba. Y el extra no es
     * cosmético: el total de la venta es precioVenta + extras - canjes, así que
     * borrar uno mueve el saldo del comprobante y la base de comisiones.
     */
    removePago(ventaId: number, pagoId: number): Promise<void>;

    // Sub-resources: extras
    listExtras(ventaId: number): Promise<any[]>;
    addExtra(ventaId: number, data: any): Promise<any>;
    removeExtra(ventaId: number, extraId: number): Promise<void>;

    // Sub-resources: canjes
    listCanjes(ventaId: number): Promise<any[]>;
    addCanje(ventaId: number, data: any): Promise<any>;
    removeCanje(ventaId: number, canjeId: number): Promise<void>;
}
