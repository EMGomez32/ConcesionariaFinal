import { evaluarPisoDeVenta } from '../../src/domain/services/pisoDeVenta';

// Unit tests PUROS (sin DB): el control del precio mínimo al vender (PROC-34).
const base = { precioVenta: 9500, monedaVenta: 'ARS', pisoFicha: 9000, monedaUnidad: 'ARS', esAdmin: false, autorizacion: null };
const autorizada = (precio: number, moneda = 'ARS') => ({ solicitudId: 7, precio, moneda });

describe('evaluarPisoDeVenta', () => {
    test('sin piso cargado no controla nada', () => {
        expect(evaluarPisoDeVenta({ ...base, pisoFicha: null, precioVenta: 1 }))
            .toEqual({ ok: true, bajoPiso: false, via: 'sin_piso', comparable: true });
    });

    test('igual o por encima del piso pasa sin marca', () => {
        expect(evaluarPisoDeVenta({ ...base, precioVenta: 9000 })).toEqual(expect.objectContaining({ ok: true, bajoPiso: false, via: 'sobre_piso' }));
    });

    test('por debajo y sin autorización se rechaza, sin decir el piso', () => {
        const r = evaluarPisoDeVenta({ ...base, precioVenta: 8000 });
        expect(r.ok).toBe(false);
        expect((r as { message: string }).message).not.toContain('9000');
    });

    test('el admin pasa por su rol y la venta queda marcada', () => {
        expect(evaluarPisoDeVenta({ ...base, precioVenta: 8000, esAdmin: true }))
            .toEqual({ ok: true, bajoPiso: true, via: 'admin', comparable: true });
    });

    test('con autorización vende hasta el valor autorizado (aunque sea menor que el de la ficha)', () => {
        expect(evaluarPisoDeVenta({ ...base, precioVenta: 8500, autorizacion: autorizada(8500) }))
            .toEqual({ ok: true, bajoPiso: true, via: 'autorizacion', comparable: true });
    });

    test('por debajo del valor AUTORIZADO tampoco', () => {
        const r = evaluarPisoDeVenta({ ...base, precioVenta: 8400, autorizacion: autorizada(8500) });
        expect(r.ok).toBe(false);
        expect((r as { message: string }).message).toMatch(/incluso del precio mínimo que te autorizaron/);
    });

    test('en otra moneda: sin autorización se rechaza; con autorización pasa sin marca (no se pudo comparar)', () => {
        const usd = { ...base, precioVenta: 10, monedaVenta: 'USD' };
        const sin = evaluarPisoDeVenta(usd);
        expect(sin.ok).toBe(false);
        expect((sin as { message: string }).message).toMatch(/otra moneda/);
        expect(evaluarPisoDeVenta({ ...usd, autorizacion: autorizada(8500, 'ARS') }))
            .toEqual({ ok: true, bajoPiso: false, via: 'autorizacion', comparable: false });
    });

    test('en otra moneda el admin pasa, sin marca', () => {
        expect(evaluarPisoDeVenta({ ...base, monedaVenta: 'USD', precioVenta: 10, esAdmin: true }))
            .toEqual({ ok: true, bajoPiso: false, via: 'admin', comparable: false });
    });
});
