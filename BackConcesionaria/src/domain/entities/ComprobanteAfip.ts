import type {
    CondicionIva,
    TipoComprobanteAfip,
    EstadoComprobanteAfip,
    EntornoAfip,
} from '@prisma/client';

/**
 * Comprobante fiscal AFIP asociado a una venta (factura electrónica A/B/C).
 * Guarda un snapshot del receptor y de los importes al momento de emitir, más el
 * resultado de AFIP (CAE + vencimiento + QR). En modo mock el CAE es simulado.
 */
export class ComprobanteAfip {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly ventaId: number,
        public readonly tipoComprobante: TipoComprobanteAfip,
        public readonly puntoVenta: number,
        public readonly numero: number,
        public readonly concepto: number,
        public readonly fechaComprobante: Date,
        public readonly receptorNombre: string,
        public readonly receptorDocTipo: number,
        public readonly receptorDocNro: string,
        public readonly receptorCondIva: CondicionIva,
        public readonly moneda: string,
        public readonly cotizacion: number,
        public readonly neto: number,
        public readonly alicuotaIva: number,
        public readonly iva: number,
        public readonly total: number,
        public readonly estado: EstadoComprobanteAfip,
        public readonly entorno: EntornoAfip,
        public readonly cae: string | null,
        public readonly caeVencimiento: Date | null,
        public readonly qrData: string | null,
        public readonly errorMsg: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
    ) { }
}
