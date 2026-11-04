/**
 * Importes con su moneda.
 *
 * Unidades, ventas, presupuestos y planes de financiación pueden estar en pesos
 * o en dólares. Un importe en dólares escrito con "$" se lee como pesos (una
 * venta de US$22.300 aparecía como "$22.300"), así que toda cifra de plata que
 * se muestra pasa por `formatMoneda` con la moneda de la entidad que la origina
 * (los pagos y canjes de una venta heredan la de la venta).
 */
export type Moneda = 'ARS' | 'USD';

export const simboloMoneda = (moneda?: string | null): string => (moneda === 'USD' ? 'US$' : '$');

/** "US$22.300", "$14.500.000", "-US$500". Hasta 2 decimales, sin ceros de relleno. */
export const formatMoneda = (monto: number | string | null | undefined, moneda?: string | null): string => {
    const n = Number(monto);
    const valor = Number.isFinite(n) ? n : 0;
    const cifra = Math.abs(valor).toLocaleString('es-AR', { maximumFractionDigits: 2 });
    return `${valor < 0 ? '-' : ''}${simboloMoneda(moneda)}${cifra}`;
};

/** Suma importes separados por moneda: un total nunca mezcla pesos con dólares. */
export const totalesPorMoneda = <T>(
    items: readonly T[],
    monto: (item: T) => number | string | null | undefined,
    moneda: (item: T) => string | null | undefined,
): Record<Moneda, number> => {
    const totales: Record<Moneda, number> = { ARS: 0, USD: 0 };
    for (const item of items) {
        const n = Number(monto(item));
        if (Number.isFinite(n)) totales[moneda(item) === 'USD' ? 'USD' : 'ARS'] += n;
    }
    return totales;
};

/** "US$32.650 · $12.500.000"; solo las monedas con importe, o "$0" si no hay ninguno. */
export const formatTotales = (totales: Record<Moneda, number>): string => {
    const partes = (['USD', 'ARS'] as const)
        .filter((m) => totales[m] !== 0)
        .map((m) => formatMoneda(totales[m], m));
    return partes.length ? partes.join(' · ') : formatMoneda(0, 'ARS');
};
