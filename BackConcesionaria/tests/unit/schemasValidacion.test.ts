import { convertirPresupuestoSchema } from '../../src/interface/validation/venta.schema';
import { transferirVehiculoSchema } from '../../src/interface/validation/vehiculo.schema';
import { registrarPagoInvoiceSchema } from '../../src/interface/validation/billing.schema';

// Unit tests PUROS (sin DB): los endpoints que iban sin validar.
describe('convertirPresupuestoSchema (POST /presupuestos/:id/convertir-en-venta)', () => {
    test('el body que manda el front hoy es válido', () => {
        const r = convertirPresupuestoSchema.safeParse({
            formaPago: 'contado', fechaVenta: '2026-09-30', moneda: 'ARS', observaciones: 'nota',
        });
        expect(r.success).toBe(true);
    });

    test('un body vacío es válido (todo sale del presupuesto)', () => {
        expect(convertirPresupuestoSchema.safeParse({}).success).toBe(true);
    });

    test.each([[-10], [0], ['abc'], [NaN]])('precioVenta inválido (%p) se rechaza', (precioVenta) => {
        expect(convertirPresupuestoSchema.safeParse({ precioVenta }).success).toBe(false);
    });

    test('pagos con monto negativo o método inventado se rechazan', () => {
        expect(convertirPresupuestoSchema.safeParse({ pagos: [{ monto: -5, metodo: 'efectivo' }] }).success).toBe(false);
        expect(convertirPresupuestoSchema.safeParse({ pagos: [{ monto: 5, metodo: 'bitcoin' }] }).success).toBe(false);
    });

    test('moneda y forma de pago fuera del catálogo se rechazan', () => {
        expect(convertirPresupuestoSchema.safeParse({ moneda: 'EUR' }).success).toBe(false);
        expect(convertirPresupuestoSchema.safeParse({ formaPago: 'trueque' }).success).toBe(false);
    });

    test('descarta lo que el cliente NO debe fijar (cliente, vehículo, reserva, tenant, id)', () => {
        const r = convertirPresupuestoSchema.safeParse({
            precioVenta: 100, clienteId: 5, vehiculoId: 9, reservaId: 3, concesionariaId: 77, id: 1, estadoEntrega: 'entregada',
        });
        expect(r.success).toBe(true);
        expect(Object.keys((r as any).data)).toEqual(['precioVenta']);
    });

    test('los items anidados también descartan claves extra', () => {
        const r = convertirPresupuestoSchema.safeParse({
            pagos: [{ monto: 10, metodo: 'efectivo', concesionariaId: 99, ventaId: 1 }],
        });
        expect(r.success).toBe(true);
        expect((r as any).data.pagos[0]).toEqual({ monto: 10, metodo: 'efectivo' });
    });

    test('sucursalId / vendedorId en 0 o vacío se interpretan como "sin valor"', () => {
        const r = convertirPresupuestoSchema.safeParse({ sucursalId: 0, vendedorId: '' });
        expect(r.success).toBe(true);
        expect((r as any).data.sucursalId).toBeUndefined();
        expect((r as any).data.vendedorId).toBeUndefined();
    });
});

describe('transferirVehiculoSchema (POST /vehiculos/:id/transferir)', () => {
    test('acepta id numérico o string numérico y motivo', () => {
        expect((transferirVehiculoSchema.parse({ sucursalDestinoId: '5', motivo: ' Traslado ' }))).toEqual({
            sucursalDestinoId: 5, motivo: 'Traslado',
        });
    });

    test('el motivo es opcional (el front lo manda como undefined)', () => {
        expect(transferirVehiculoSchema.safeParse({ sucursalDestinoId: 3, motivo: undefined }).success).toBe(true);
    });

    test.each([[undefined], [0], [-1], ['x'], [1.5], [null]])('sucursalDestinoId inválido (%p) se rechaza', (sucursalDestinoId) => {
        expect(transferirVehiculoSchema.safeParse({ sucursalDestinoId }).success).toBe(false);
    });

    test('motivo demasiado largo se rechaza', () => {
        expect(transferirVehiculoSchema.safeParse({ sucursalDestinoId: 1, motivo: 'x'.repeat(501) }).success).toBe(false);
    });
});

describe('registrarPagoInvoiceSchema (POST /billing/invoices/:id/payments)', () => {
    const ok = { monto: 100, moneda: 'ARS', metodo: 'efectivo' };

    test('el payload que manda el front es válido', () => {
        expect(registrarPagoInvoiceSchema.safeParse(ok).success).toBe(true);
    });

    test('monto string decimal se coerciona', () => {
        expect((registrarPagoInvoiceSchema.parse({ ...ok, monto: '1500.50' }) as any).monto).toBe(1500.5);
    });

    test.each([[-5], [0], ['abc'], [''], [NaN], [1e12], [null], [undefined]])('monto inválido (%p) se rechaza', (monto) => {
        expect(registrarPagoInvoiceSchema.safeParse({ ...ok, monto }).success).toBe(false);
    });

    test('moneda y método fuera del catálogo se rechazan', () => {
        expect(registrarPagoInvoiceSchema.safeParse({ ...ok, moneda: 'EUR' }).success).toBe(false);
        expect(registrarPagoInvoiceSchema.safeParse({ ...ok, metodo: 'bitcoin' }).success).toBe(false);
    });

    test('descarta claves que el tenant no debe fijar (concesionariaId, invoiceId, id)', () => {
        const r = registrarPagoInvoiceSchema.parse({ ...ok, concesionariaId: 9, invoiceId: 3, id: 1 }) as any;
        expect(r).not.toHaveProperty('concesionariaId');
        expect(r).not.toHaveProperty('invoiceId');
        expect(r).not.toHaveProperty('id');
    });
});
