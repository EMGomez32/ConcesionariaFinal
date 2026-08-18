import type { IAfipService, EmitirCaeRequest, EmitirCaeResult, AfipEntorno } from '../../domain/services/afip/IAfipService';

/**
 * Implementación MOCK de AFIP: NO llama a ningún web service. Simula la respuesta de
 * WSFEv1 devolviendo un CAE con formato válido (14 dígitos) y un vencimiento a +10
 * días, de forma DETERMINÍSTICA (misma entrada → mismo CAE). Sirve para construir y
 * probar todo el flujo (emisión, persistencia, PDF con QR) sin un certificado real.
 *
 * El QR que sale del PDF tiene formato válido, pero como el CAE es simulado, AFIP lo
 * reportaría como inexistente al escanearlo — es lo esperado en modo mock.
 */
export class MockAfipService implements IAfipService {
    entorno(): AfipEntorno {
        return 'mock';
    }

    async emitirCae(req: EmitirCaeRequest): Promise<EmitirCaeResult> {
        return {
            ok: true,
            cae: mockCae(req),
            caeVencimiento: addDays(req.fecha, 10),
            observaciones: 'CAE simulado (modo mock, sin AFIP).',
        };
    }
}

/** CAE mock determinístico de 14 dígitos. */
function mockCae(req: EmitirCaeRequest): string {
    const seed = `${req.cuit}-${req.puntoVenta}-${req.tipoCbte}-${req.numero}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    // 14 dígitos: prefijo "7" (rango realista de CAE) + 13 dígitos derivados del hash.
    const base = (BigInt(h) * 1000003n + BigInt(req.numero)) % 10n ** 13n;
    return '7' + base.toString().padStart(13, '0');
}

/** Suma `days` a una fecha YYYYMMDD y devuelve YYYYMMDD. */
function addDays(yyyymmdd: string, days: number): string {
    const y = Number(yyyymmdd.slice(0, 4));
    const m = Number(yyyymmdd.slice(4, 6));
    const d = Number(yyyymmdd.slice(6, 8));
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
}
