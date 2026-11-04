import { describe, expect, it } from 'vitest';
import { formatFecha, hoyLocal } from './fecha';

describe('formatFecha', () => {
    it('muestra una columna @db.Date en su día, sin correrla por la zona horaria', () => {
        expect(formatFecha('2026-10-07T00:00:00.000Z')).toBe('07/10/2026');
    });

    it('devuelve "-" si no hay fecha', () => {
        expect(formatFecha(null)).toBe('-');
    });
});

describe('hoyLocal', () => {
    it('usa la fecha local aunque en UTC ya sea el día siguiente', () => {
        // 22:30 del 3 de noviembre en la hora local del equipo que corre el test.
        expect(hoyLocal(new Date(2026, 10, 3, 22, 30))).toBe('2026-11-03');
    });

    it('rellena mes y día con cero', () => {
        expect(hoyLocal(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
    });
});
