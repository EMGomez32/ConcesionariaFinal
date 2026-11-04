import { describe, expect, it } from 'vitest';
import { formatMoneda, formatTotales, totalesPorMoneda } from './moneda';

describe('formatMoneda', () => {
    it('marca los dólares con US$ y los pesos con $', () => {
        expect(formatMoneda(22300, 'USD')).toBe('US$22.300');
        expect(formatMoneda(14500000, 'ARS')).toBe('$14.500.000');
    });

    it('toma pesos cuando la moneda falta o es desconocida', () => {
        expect(formatMoneda(1000, undefined)).toBe('$1.000');
        expect(formatMoneda(1000, 'XYZ')).toBe('$1.000');
    });

    it('acepta strings de Prisma Decimal y pone el signo antes del símbolo', () => {
        expect(formatMoneda('-500', 'USD')).toBe('-US$500');
        expect(formatMoneda('933333.33', 'ARS')).toBe('$933.333,33');
    });

    it('muestra 0 ante un valor que no es número', () => {
        expect(formatMoneda(null, 'USD')).toBe('US$0');
        expect(formatMoneda('abc', 'ARS')).toBe('$0');
    });
});

describe('totalesPorMoneda', () => {
    it('no suma dólares con pesos', () => {
        const items = [
            { total: '11500', moneda: 'USD' },
            { total: '21150', moneda: 'USD' },
            { total: '12500000', moneda: 'ARS' },
        ];
        const t = totalesPorMoneda(items, (i) => i.total, (i) => i.moneda);
        expect(t).toEqual({ USD: 32650, ARS: 12500000 });
        expect(formatTotales(t)).toBe('US$32.650 · $12.500.000');
    });

    it('muestra solo las monedas con importe, o $0 si no hay ninguno', () => {
        expect(formatTotales({ USD: 32650, ARS: 0 })).toBe('US$32.650');
        expect(formatTotales({ USD: 0, ARS: 0 })).toBe('$0');
    });
});
