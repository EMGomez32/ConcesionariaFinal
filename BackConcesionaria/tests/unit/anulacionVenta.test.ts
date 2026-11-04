import { bloqueosDeAnulacion, mensajeDeBloqueo } from '../../src/domain/services/anulacionVenta';
import { anularVentaSchema, changeEstadoEntregaSchema } from '../../src/interface/validation/venta.schema';

// Unit tests PUROS (sin DB): qué impide anular una venta (PROC-30) y el motivo.
const limpia = { ventaId: 12, pagos: [], financiaciones: [], comprobante: null };
const factura = (entorno: string, estado: string) => ({
    id: 5, tipoComprobante: 'factura_b', puntoVenta: 1, numero: 42, entorno, estado,
});

describe('bloqueosDeAnulacion', () => {
    test('una venta sin nada colgando se anula', () => {
        expect(bloqueosDeAnulacion(limpia)).toEqual([]);
    });

    test('pagos registrados bloquean, con sus ids para revertirlos', () => {
        const b = bloqueosDeAnulacion({ ...limpia, pagos: [{ id: 3 }, { id: 4 }] });
        expect(b).toEqual([expect.objectContaining({ tipo: 'pagos', ids: [3, 4] })]);
        expect(b[0].mensaje).toMatch(/2 pagos registrados: quitalos/);
    });

    test.each(['activa', 'en_mora'])('una financiación %s bloquea aunque no tenga cobros', (estado) => {
        const b = bloqueosDeAnulacion({ ...limpia, financiaciones: [{ id: 7, estado, cobros: 0 }] });
        expect(b).toEqual([expect.objectContaining({ tipo: 'financiacion', ids: [7] })]);
        expect(b[0].mensaje).toContain('N° 000007');
    });

    test.each(['cancelada', 'refinanciada'])('una financiación %s SIN cobros no bloquea', (estado) => {
        expect(bloqueosDeAnulacion({ ...limpia, financiaciones: [{ id: 7, estado, cobros: 0 }] })).toEqual([]);
    });

    test('una financiación cancelada CON cobros bloquea: esa plata entró', () => {
        const b = bloqueosDeAnulacion({ ...limpia, financiaciones: [{ id: 7, estado: 'cancelada', cobros: 2 }] });
        expect(b).toHaveLength(1);
        expect(b[0].mensaje).toMatch(/tiene 2 cuotas cobradas/);
        expect(b[0].mensaje).not.toMatch(/está cancelada/);
    });

    test('activa y con cobros: un solo bloqueo que dice las dos cosas', () => {
        const b = bloqueosDeAnulacion({ ...limpia, financiaciones: [{ id: 7, estado: 'activa', cobros: 1 }] });
        expect(b).toHaveLength(1);
        expect(b[0].mensaje).toMatch(/está activa y tiene 1 cuota cobrada/);
    });

    test.each([
        ['homologacion', 'emitida'],
        ['produccion', 'emitida'],
        ['produccion', 'pendiente'],
    ])('una factura informada a AFIP (%s, %s) bloquea y pide nota de crédito', (entorno, estado) => {
        const b = bloqueosDeAnulacion({ ...limpia, comprobante: factura(entorno, estado) });
        expect(b).toEqual([expect.objectContaining({ tipo: 'comprobante_afip', ids: [5] })]);
        expect(b[0].mensaje).toMatch(/factura B 0001-00000042/);
        expect(b[0].mensaje).toMatch(/nota de crédito/);
    });

    test('en modo mock el CAE es simulado: no bloquea', () => {
        expect(bloqueosDeAnulacion({ ...limpia, comprobante: factura('mock', 'emitida') })).toEqual([]);
    });

    test('una factura que AFIP rechazó (error, sin CAE) no bloquea', () => {
        expect(bloqueosDeAnulacion({ ...limpia, comprobante: factura('produccion', 'error') })).toEqual([]);
    });

    test('el mensaje junta todo lo que hay que revertir, de una vez', () => {
        const b = bloqueosDeAnulacion({
            ...limpia,
            pagos: [{ id: 1 }],
            financiaciones: [{ id: 7, estado: 'activa', cobros: 0 }],
            comprobante: factura('produccion', 'emitida'),
        });
        expect(b.map((x) => x.tipo)).toEqual(['pagos', 'financiacion', 'comprobante_afip']);
        const msg = mensajeDeBloqueo(12, b);
        expect(msg).toMatch(/^No se puede anular la venta N° 000012 todavía: /);
        expect(msg.split('; ')).toHaveLength(3);
    });
});

describe('anularVentaSchema (DELETE /ventas/:id)', () => {
    test('sin body pide el motivo (no "se esperaba un objeto")', () => {
        const r = anularVentaSchema.safeParse(undefined);
        expect(r.success).toBe(false);
        expect(r.error?.issues[0].path).toEqual(['motivo']);
    });

    test('un motivo corto no alcanza', () => {
        const r = anularVentaSchema.safeParse({ motivo: '   error   ' });
        expect(r.success).toBe(false);
        expect(r.error?.issues[0].message).toMatch(/al menos 10 caracteres/);
    });

    test('recorta el motivo y descarta el resto del body', () => {
        const r = anularVentaSchema.safeParse({ motivo: '  error de carga  ', concesionariaId: 9 });
        expect(r.success).toBe(true);
        expect(r.data).toEqual({ motivo: 'error de carga' });
    });

    test('tope de 500 caracteres', () => {
        expect(anularVentaSchema.safeParse({ motivo: 'x'.repeat(501) }).success).toBe(false);
    });
});

describe('changeEstadoEntregaSchema', () => {
    test('cancelada sin motivo se rechaza en el campo motivo', () => {
        const r = changeEstadoEntregaSchema.safeParse({ estadoEntrega: 'cancelada' });
        expect(r.success).toBe(false);
        expect(r.error?.issues[0].path).toEqual(['motivo']);
    });

    test('cancelada con motivo pasa', () => {
        expect(changeEstadoEntregaSchema.safeParse({ estadoEntrega: 'cancelada', motivo: 'el cliente desistió' }).success).toBe(true);
    });

    test('avanzar la entrega no pide motivo', () => {
        expect(changeEstadoEntregaSchema.safeParse({ estadoEntrega: 'entregada' }).success).toBe(true);
    });
});
