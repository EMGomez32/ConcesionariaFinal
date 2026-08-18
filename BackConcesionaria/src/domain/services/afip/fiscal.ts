import type { CondicionIva, TipoComprobanteAfip, TipoDocumento } from '@prisma/client';

/**
 * Lógica FISCAL pura (sin I/O): mapeo de códigos AFIP, determinación de tipo de
 * comprobante (A/B/C), descomposición neto+IVA y armado del QR de la RG 4291.
 * Es dominio puro → testeable y compartido por el mock y el servicio real.
 */

export const ALICUOTA_IVA_DEFAULT = 21;

/** Códigos de tipo de comprobante (WSFEv1 FEParamGetTiposCbte). */
export const CBTE_CODE: Record<TipoComprobanteAfip, number> = {
    factura_a: 1,
    factura_b: 6,
    factura_c: 11,
};
export const CBTE_LETRA: Record<TipoComprobanteAfip, string> = {
    factura_a: 'A',
    factura_b: 'B',
    factura_c: 'C',
};

/** Id de alícuota IVA (FEParamGetTiposIva): 3=0%, 4=10.5%, 5=21%, 6=27%. */
export function ivaId(alicuota: number): number {
    if (alicuota === 27) return 6;
    if (alicuota === 10.5) return 4;
    if (alicuota === 0) return 3;
    return 5; // 21% (default)
}

/** Código de documento del receptor (FEParamGetTiposDoc): 80=CUIT, 86=CUIL, 96=DNI, 99=CF. */
export function docCodeFor(tipo: TipoDocumento | null | undefined): number {
    switch (tipo) {
        case 'CUIT': return 80;
        case 'CUIL': return 86;
        case 'DNI': return 96;
        default: return 99; // consumidor final / sin identificar
    }
}

/** Id de condición frente al IVA del receptor (RG 5616): 1=RI, 4=Exento, 5=CF, 6=Monotributo. */
export function condIvaReceptorId(c: CondicionIva): number {
    switch (c) {
        case 'responsable_inscripto': return 1;
        case 'exento': return 4;
        case 'monotributo': return 6;
        case 'consumidor_final':
        default: return 5;
    }
}

/**
 * Tipo/letra del comprobante según la condición del EMISOR y del RECEPTOR:
 * - Emisor Responsable Inscripto: A si el receptor es RI (IVA discriminado); si no, B.
 * - Emisor Monotributo/Exento: C.
 */
export function determinarTipoComprobante(
    emisor: CondicionIva,
    receptor: CondicionIva,
): TipoComprobanteAfip {
    if (emisor === 'responsable_inscripto') {
        return receptor === 'responsable_inscripto' ? 'factura_a' : 'factura_b';
    }
    return 'factura_c';
}

export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Descompone un precio BRUTO (IVA incluido — así lo guarda hoy la Venta) en neto + IVA.
 * En Factura C no se discrimina IVA: neto = total, iva = 0.
 * NOTA: para autos USADOS de un habitualista hay un régimen de IVA especial (base
 * reducida) que este cálculo simple no contempla — queda como refinamiento futuro;
 * por ahora usa la alícuota general sobre el precio.
 */
export function descomponerImporte(
    bruto: number,
    alicuota: number,
    tipo: TipoComprobanteAfip,
): { neto: number; iva: number; total: number; alicuota: number } {
    const total = round2(bruto);
    if (tipo === 'factura_c') {
        return { neto: total, iva: 0, total, alicuota: 0 };
    }
    const neto = round2(total / (1 + alicuota / 100));
    const iva = round2(total - neto);
    return { neto, iva, total, alicuota };
}

/** Moneda AFIP: ARS→PES, USD→DOL. */
export function monedaAfip(moneda: string): string {
    return moneda === 'USD' ? 'DOL' : 'PES';
}

/** Datos del QR de la factura electrónica (RG 4291). */
export interface AfipQrData {
    ver: number;
    fecha: string; // YYYY-MM-DD
    cuit: number; // emisor
    ptoVta: number;
    tipoCmp: number;
    nroCmp: number;
    importe: number;
    moneda: string;
    ctz: number;
    tipoDocRec: number;
    nroDocRec: number;
    tipoCodAut: string; // 'E' = CAE
    codAut: number; // el CAE
}

/** URL que codifica el QR de la factura (base64 del JSON, RG 4291). */
export function buildAfipQrUrl(d: AfipQrData): string {
    const b64 = Buffer.from(JSON.stringify(d), 'utf-8').toString('base64');
    return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
}
