import { ComprobanteAfip } from '../entities/ComprobanteAfip';

export interface IComprobanteAfipRepository {
    /** Comprobante ya emitido para una venta (o null si todavía no se facturó). */
    findByVenta(ventaId: number): Promise<ComprobanteAfip | null>;
}
