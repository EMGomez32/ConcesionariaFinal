/**
 * Puerto del servicio de facturación electrónica AFIP. Lo implementan:
 *  - MockAfipService (CAE simulado, sin AFIP) — Corte 1.
 *  - WsfeAfipService (WSAA + WSFEv1 real, self-hosted) — Corte 2, misma interfaz.
 *
 * El use-case depende SÓLO de esta interfaz, así que activar el modo real es cambiar
 * la implementación que devuelve la factory, sin tocar la lógica de negocio.
 */

export interface EmitirCaeRequest {
    cuit: number; // emisor
    puntoVenta: number;
    tipoCbte: number; // código AFIP (1=A, 6=B, 11=C)
    concepto: number; // 1=productos
    docTipo: number; // 80/86/96/99
    docNro: number; // 0 si consumidor final sin identificar
    condIvaReceptorId: number; // RG 5616
    numero: number; // número de comprobante a autorizar
    fecha: string; // YYYYMMDD
    neto: number;
    iva: number;
    total: number;
    alicuota: number; // % (0 si Factura C)
    moneda: string; // 'PES' | 'DOL'
    cotizacion: number;
}

export interface EmitirCaeResult {
    ok: boolean;
    cae?: string;
    caeVencimiento?: string; // YYYYMMDD
    observaciones?: string; // observaciones de AFIP (no bloqueantes)
    error?: string; // motivo del rechazo si ok=false
}

export type AfipEntorno = 'mock' | 'homologacion' | 'produccion';

export interface IAfipService {
    entorno(): AfipEntorno;
    /** Solicita el CAE para un comprobante ya numerado. */
    emitirCae(req: EmitirCaeRequest): Promise<EmitirCaeResult>;
}
