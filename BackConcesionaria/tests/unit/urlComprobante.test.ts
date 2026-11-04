// Unit tests (sin DB): links a comprobantes. Sólo https absoluto o un archivo de /uploads.
import { esUrlDeComprobanteValida } from '../../src/interface/validation/urlComprobante';
import { createGastoFijoSchema, updateGastoFijoSchema } from '../../src/interface/validation/gasto-fijo.schema';
import { createGastoSchema } from '../../src/interface/validation/gasto.schema';
import { createItemSchema } from '../../src/interface/validation/postventa-item.schema';

describe('esUrlDeComprobanteValida', () => {
    test.each([
        'https://drive.google.com/file/d/abc/view',
        'https://proveedor.com.ar/factura?id=12',
        '/uploads/vehiculos-3/2026-11/0123456789abcdef0123456789abcdef.pdf',
        '/uploads/solicitudes-4/2026-11/abc.pdf',
    ])('acepta %s', (u) => expect(esUrlDeComprobanteValida(u)).toBe(true));

    test.each([
        'javascript:alert(1)',
        'JAVASCRIPT:alert(1)',
        'data:text/html;base64,PHNjcmlwdD4=',
        'http://sitio-sin-tls.com/factura.pdf',
        'ftp://x.com/a.pdf',
        '//evil.example/factura.pdf',
        '/uploads/../.env',
        '/uploads/./x.pdf',
        '/uploads/x.pdf?exp=1&sig=2',
        '/otra-ruta/x.pdf',
        'https://usuario:clave@proveedor.com/a.pdf',
        'factura.pdf',
    ])('rechaza %s', (u) => expect(esUrlDeComprobanteValida(u)).toBe(false));
});

describe('schemas con comprobanteUrl', () => {
    const gastoFijo = { categoriaId: 1, anio: 2026, mes: 11, monto: 100, descripcion: 'Luz' };

    test('gasto fijo: link https pasa, javascript: no, vacío y null siguen funcionando', () => {
        expect(createGastoFijoSchema.safeParse({ ...gastoFijo, comprobanteUrl: 'https://x.com/a.pdf' }).success).toBe(true);
        expect(createGastoFijoSchema.safeParse({ ...gastoFijo, comprobanteUrl: 'javascript:alert(1)' }).success).toBe(false);
        expect(createGastoFijoSchema.safeParse({ ...gastoFijo, comprobanteUrl: '' }).success).toBe(true);
        const limpia = updateGastoFijoSchema.safeParse({ comprobanteUrl: null });
        expect(limpia.success && limpia.data.comprobanteUrl).toBeNull();
    });

    test('gasto de vehículo y item de postventa también validan el link', () => {
        const gasto = { vehiculoId: 1, monto: 10, fechaGasto: '2026-11-01' };
        expect(createGastoSchema.safeParse({ ...gasto, comprobanteUrl: 'data:text/html,x' }).success).toBe(false);
        expect(createGastoSchema.safeParse({ ...gasto, urlComprobante: 'https://x.com/a.pdf' }).success).toBe(true);
        const item = { casoId: 1, fecha: '2026-11-01', descripcion: 'Cambio de aceite', monto: 0 };
        expect(createItemSchema.safeParse({ ...item, comprobanteUrl: 'http://x.com/a.pdf' }).success).toBe(false);
        expect(createItemSchema.safeParse({ ...item, comprobanteUrl: '/uploads/postventa-1/2026-11/a.pdf' }).success).toBe(true);
    });
});
