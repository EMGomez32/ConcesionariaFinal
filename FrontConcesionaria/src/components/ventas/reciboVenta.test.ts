import { describe, expect, it } from 'vitest';
import { calcularSaldoVenta, escaparHtml, htmlReciboVenta } from './reciboVenta';
import { ENTREGA_ESTADO, rotuloEstado } from './estados';

describe('calcularSaldoVenta', () => {
    it('resta pagos y canjes del precio más los extras', () => {
        const c = calcularSaldoVenta({
            precioVenta: '22300.00',
            extras: [{ monto: 500 }],
            pagos: [{ monto: 10000 }, { monto: '2000.50' }],
            canjes: [{ valorTomado: 8000 }],
        });
        expect(c).toEqual({ total: 22800, totalPagos: 12000.5, totalCanjes: 8000, saldo: 2799.5 });
    });

    it('no deja residuos de coma flotante', () => {
        const c = calcularSaldoVenta({
            precioVenta: 0.3,
            extras: [],
            pagos: [{ monto: 0.1 }, { monto: 0.2 }],
            canjes: [],
        });
        expect(c.saldo).toBe(0);
    });
});

describe('escaparHtml', () => {
    it('neutraliza el HTML que venga en los datos de la base', () => {
        expect(escaparHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
        expect(escaparHtml(null)).toBe('');
    });
});

describe('htmlReciboVenta', () => {
    it('muestra el precio con su moneda, el dominio y el saldo', () => {
        const html = htmlReciboVenta({
            id: 42,
            fechaVenta: '2026-11-03T00:00:00.000Z',
            precioVenta: 22300,
            moneda: 'USD',
            formaPago: 'canje_mas_diferencia',
            concesionaria: { nombre: 'Autos <Sur>' },
            cliente: { nombre: 'Ana Pérez' },
            vehiculo: { marca: 'Toyota', modelo: 'Corolla', dominio: 'AB123CD' },
            pagos: [{ metodo: 'efectivo', monto: 2300 }],
            extras: [],
            canjes: [{ descripcion: 'Fiat Palio (AA111BB)', valorTomado: 5000 }],
        });
        expect(html).toContain('N° 000042');
        expect(html).toContain('03/11/2026');
        expect(html).toContain('US$22.300');
        expect(html).toContain('AB123CD');
        expect(html).toContain('Canje más diferencia');
        expect(html).toContain('US$15.000'); // saldo = 22.300 − 2.300 − 5.000
        expect(html).toContain('Autos &lt;Sur&gt;');
    });
});

describe('rotuloEstado', () => {
    it('nunca devuelve el estado crudo de la base', () => {
        expect(rotuloEstado(ENTREGA_ESTADO, 'cancelada').label).toBe('Anulada');
        expect(rotuloEstado({}, 'convertida_en_venta').label).toBe('Convertida en venta');
        expect(rotuloEstado({}, null).label).toBe('-');
    });
});
