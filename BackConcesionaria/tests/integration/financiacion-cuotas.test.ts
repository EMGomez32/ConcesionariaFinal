import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique } from './helpers';

/**
 * Plan de cuotas sin residuo de redondeo: la suma de las cuotas es exactamente el
 * total del plan (sin tasa, el monto financiado) y la diferencia la absorbe la
 * última cuota. Antes un plan de $11.200.000 en 12 mostraba cuotas que sumaban
 * $11.199.996.
 */
describe('Plan de cuotas: la suma cierra al centavo', () => {
    let saToken: string;
    let adToken: string;
    let tenantId: number;
    let vendedorId: number;
    let sucursalId: number;
    let clienteId: number;

    // Se compara en centavos: sumar los Decimal como float arrastra error.
    const centavos = (v: number | string) => Math.round(Number(v) * 100);
    const ordenadas = (cuotas: Array<{ nroCuota: number; montoCuota: string | number }>) =>
        [...cuotas].sort((a, b) => a.nroCuota - b.nroCuota).map((c) => centavos(c.montoCuota));

    const nuevaVenta = async (): Promise<number> => {
        const v = await api.post(
            '/api/vehiculos',
            {
                marca: unique('MCuo'), modelo: 'C', anio: 2022, concesionariaId: tenantId, sucursalId,
                fechaIngreso: '2026-01-10T00:00:00Z', tipo: 'USADO', precioCompra: 9_000_000, precioLista: 14_000_000,
                estado: 'publicado', origen: 'compra', moneda: 'ARS',
            },
            authHeaders(saToken),
        );
        expect(v.status).toBe(201);
        const venta = await api.post(
            '/api/ventas',
            {
                sucursalId, clienteId, vendedorId, vehiculoId: v.data.id, precioVenta: 14_000_000, moneda: 'ARS',
                formaPago: 'financiado_propio', fechaVenta: '2026-10-01T00:00:00Z',
            },
            authHeaders(adToken),
        );
        expect(venta.status).toBe(201);
        return venta.data.id;
    };

    const financiar = async (body: Record<string, unknown>) => {
        const ventaId = await nuevaVenta();
        const r = await api.post(
            '/api/financiaciones',
            { ventaId, clienteId, fechaInicio: '2026-10-10', diaVencimiento: 10, moneda: 'ARS', ...body },
            authHeaders(adToken),
        );
        expect(r.status).toBe(201);
        return r.data;
    };

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        const ad = await loginAsAdmin();
        saToken = sa.token;
        adToken = ad.token;
        tenantId = ad.user.concesionariaId!;
        vendedorId = ad.user.id;

        const suc = await api.post('/api/sucursales', { nombre: unique('SucCuo'), concesionariaId: tenantId }, authHeaders(saToken));
        expect(suc.status).toBe(201);
        sucursalId = suc.data.id;
        const cli = await api.post('/api/clientes', { nombre: unique('CliCuo') }, authHeaders(adToken));
        expect(cli.status).toBe(201);
        clienteId = cli.data.id;
    });

    test('$11.200.000 en 12 cuotas sin tasa suma exactamente el monto financiado', async () => {
        const f = await financiar({ montoFinanciado: 11_200_000, cuotas: 12 });
        const montos = ordenadas(f.cuotasPlan);

        expect(montos).toHaveLength(12);
        expect(montos.reduce((s, c) => s + c, 0)).toBe(1_120_000_000);
        // Cuota pareja y la última absorbe el redondeo.
        expect(new Set(montos.slice(0, 11))).toEqual(new Set([93_333_333]));
        expect(montos[11]).toBe(93_333_337);

        // Lo mismo al releer el plan guardado.
        const detalle = await api.get(`/api/financiaciones/${f.id}`, authHeaders(adToken));
        expect(ordenadas(detalle.data.cuotasPlan).reduce((s, c) => s + c, 0)).toBe(1_120_000_000);
    });

    test('con tasa: las cuotas suman el total del sistema francés y sólo la última difiere', async () => {
        const f = await financiar({ montoFinanciado: 1_000_000, cuotas: 7, tasaMensual: 5 });
        const montos = ordenadas(f.cuotasPlan);

        const i = 0.05;
        const cuota = (1_000_000 * i) / (1 - Math.pow(1 + i, -7));
        expect(montos.reduce((s, c) => s + c, 0)).toBe(Math.round(cuota * 7 * 100));
        expect(new Set(montos.slice(0, 6)).size).toBe(1);
        expect(Math.abs(montos[6] - montos[0])).toBeLessThanOrEqual(7);
    });

    test('el simulador usa la misma regla: totalAPagar = monto sin tasa', async () => {
        const r = await api.post('/api/financiaciones/simular', { montoFinanciado: 11_200_000, cuotas: 12 }, authHeaders(adToken));
        expect(r.status).toBe(200);
        expect(r.data.resumen.totalAPagar).toBe(11_200_000);
        expect(r.data.resumen.costoFinanciero).toBe(0);
        expect(r.data.resumen.valorCuota).toBe(933_333.33);
        const montos = ordenadas(r.data.cuotas);
        expect(montos.reduce((s, c) => s + c, 0)).toBe(1_120_000_000);
    });

    test('una sola cuota es el monto entero', async () => {
        const r = await api.post('/api/financiaciones/simular', { montoFinanciado: 1234.56, cuotas: 1 }, authHeaders(adToken));
        expect(r.status).toBe(200);
        expect(r.data.cuotas.map((c: { montoCuota: number }) => c.montoCuota)).toEqual([1234.56]);
    });
});
