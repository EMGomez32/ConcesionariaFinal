import { evaluarPagoCuota, aCentavos } from '../../src/domain/services/pagoCuota';

// Unit tests PUROS (sin DB): validan la matemática y las reglas del cobro de cuota.
// Corren standalone: `npx jest tests/unit` sin el stack docker levantado.
describe('evaluarPagoCuota', () => {
    describe('rechazos', () => {
        it('rechaza una cuota ya pagada (estado no cobrable)', () => {
            const r = evaluarPagoCuota({ estado: 'pagada', saldoCuota: 0, monto: 100 });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.code).toBe('CUOTA_NO_COBRABLE');
        });

        it('rechaza una cuota refinanciada', () => {
            const r = evaluarPagoCuota({ estado: 'refinanciada', saldoCuota: 500, monto: 100 });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.status).toBe(422);
        });

        it('rechaza saldo 0 aunque el estado sea cobrable', () => {
            const r = evaluarPagoCuota({ estado: 'parcial', saldoCuota: 0, monto: 100 });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.code).toBe('CUOTA_SALDADA');
        });

        it('rechaza monto <= 0', () => {
            expect(evaluarPagoCuota({ estado: 'pendiente', saldoCuota: 100, monto: 0 }).ok).toBe(false);
            const neg = evaluarPagoCuota({ estado: 'pendiente', saldoCuota: 100, monto: -50 });
            expect(neg.ok).toBe(false);
            if (!neg.ok) expect(neg.code).toBe('VALIDATION_ERROR');
        });

        it('rechaza sobrepago (monto > saldo)', () => {
            const r = evaluarPagoCuota({ estado: 'pendiente', saldoCuota: 1000, monto: 1000.01 });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.code).toBe('MONTO_EXCEDE_SALDO');
        });
    });

    describe('pago total', () => {
        it('salda la cuota cuando monto == saldo', () => {
            const r = evaluarPagoCuota({ estado: 'pendiente', saldoCuota: 8333.33, monto: 8333.33 });
            expect(r).toMatchObject({ ok: true, saldada: true, nuevoSaldo: 0, nuevoEstado: 'pagada' });
        });

        it('paga desde estado vencida', () => {
            const r = evaluarPagoCuota({ estado: 'vencida', saldoCuota: 500, monto: 500 });
            expect(r.ok && r.nuevoEstado).toBe('pagada');
        });
    });

    describe('pago parcial', () => {
        it('deja saldo remanente y estado parcial', () => {
            const r = evaluarPagoCuota({ estado: 'pendiente', saldoCuota: 1000, monto: 400 });
            expect(r).toMatchObject({ ok: true, saldada: false, nuevoSaldo: 600, nuevoEstado: 'parcial' });
        });

        it('un segundo parcial que satura deja la cuota pagada', () => {
            const r = evaluarPagoCuota({ estado: 'parcial', saldoCuota: 600, monto: 600 });
            expect(r).toMatchObject({ ok: true, saldada: true, nuevoSaldo: 0, nuevoEstado: 'pagada' });
        });
    });

    describe('redondeo a centavos', () => {
        it('redondea el monto a 2 decimales', () => {
            const r = evaluarPagoCuota({ estado: 'pendiente', saldoCuota: 100, monto: 99.999 });
            // 99.999 → 100.00, que == saldo → salda la cuota sin sobrepasarlo.
            expect(r).toMatchObject({ ok: true, monto: 100, saldada: true, nuevoSaldo: 0 });
        });

        it('el saldo remanente no arrastra flotante', () => {
            const r = evaluarPagoCuota({ estado: 'pendiente', saldoCuota: 100, monto: 33.33 });
            expect(r.ok && r.nuevoSaldo).toBe(66.67);
        });

        it('aCentavos redondea correctamente', () => {
            expect(aCentavos(0.1 + 0.2)).toBe(0.3);
            expect(aCentavos(100 / 3)).toBe(33.33);
        });
    });
});
