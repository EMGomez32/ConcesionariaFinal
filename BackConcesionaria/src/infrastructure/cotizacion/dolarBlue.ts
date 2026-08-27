/**
 * Cotización del dólar BLUE (informal), que es como se manejan los usados en
 * Argentina. Se usa SÓLO para que un presupuesto en pesos pueda competir contra
 * autos publicados en dólares (y viceversa): la conversión es ORIENTATIVA — el
 * precio real del auto sigue en su moneda—, y si la fuente no responde, el
 * buscador vuelve al comportamiento de siempre (no mezcla monedas).
 *
 * Fuente: dolarapi.com (pública, gratis, sin API-key). Se cachea en memoria con
 * un TTL corto: no tiene sentido pegarle a la API en cada búsqueda, y el blue no
 * se mueve tanto en minutos.
 *
 * A propósito NO importa `logger`/`config`/`env`: esos validan variables de
 * entorno y hacen `process.exit(1)` en el import, lo que voltearía a los unit
 * tests que importan la conversión pura de este módulo. Por eso el único log
 * (best-effort) va por `console.warn`.
 */

const FUENTE = 'https://dolarapi.com/v1/dolares/blue';
const TTL_MS = 10 * 60 * 1000; // 10 min

export interface Cotizacion {
    /** Valor de VENTA (lo que cuesta comprar un dólar en pesos). */
    valor: number;
    /** ISO de la última actualización que informó la fuente. */
    actualizado: string;
    tipo: 'blue';
}

let cache: { data: Cotizacion; expira: number } | null = null;
let enVuelo: Promise<Cotizacion | null> | null = null;

async function traer(): Promise<Cotizacion | null> {
    try {
        const res = await fetch(FUENTE, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as { venta?: number; fechaActualizacion?: string };
        const valor = Number(j?.venta);
        if (!Number.isFinite(valor) || valor <= 0) throw new Error('venta inválida');
        return { valor, actualizado: j.fechaActualizacion ?? '', tipo: 'blue' };
    } catch (e) {
        console.warn(`[cotizacion] no se pudo traer el dólar blue: ${(e as Error).message}`);
        return null;
    }
}

/**
 * Devuelve la cotización blue vigente (cacheada). `null` si la fuente no
 * respondió y no hay cache: el caller DEBE degradar (no convertir).
 */
export async function getDolarBlue(): Promise<Cotizacion | null> {
    const ahora = Date.now();
    if (cache && cache.expira > ahora) return cache.data;
    // Single-flight: si ya hay un fetch en curso, esperamos ese.
    if (!enVuelo) {
        enVuelo = traer().finally(() => { enVuelo = null; });
    }
    const fresca = await enVuelo;
    if (fresca) {
        cache = { data: fresca, expira: ahora + TTL_MS };
        return fresca;
    }
    // La fuente falló: si teníamos un valor viejo, lo usamos igual (mejor que nada
    // para una conversión orientativa); si no, null → el caller no convierte.
    return cache?.data ?? null;
}

/**
 * Convierte `monto` de la moneda `de` a la moneda `a` usando el blue (venta).
 * Sólo ARS↔USD; cualquier otro par devuelve null (no se inventa una conversión).
 * Es PURA (recibe la cotización) para poder testearla sin red.
 */
export function convertirMonto(monto: number, de: string, a: string, blueVenta: number): number | null {
    if (!Number.isFinite(monto) || !Number.isFinite(blueVenta) || blueVenta <= 0) return null;
    if (de === a) return monto;
    if (de === 'USD' && a === 'ARS') return monto * blueVenta;
    if (de === 'ARS' && a === 'USD') return monto / blueVenta;
    return null;
}
