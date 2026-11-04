import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique } from './helpers';

/**
 * Pestañas Presupuestos / Reservas / Ventas de la ficha del vehículo: el front las
 * llena con los listados filtrados por `vehiculoId`. Reserva y venta tienen la
 * columna; el presupuesto no (las unidades van en sus ítems), así que el repo
 * traduce el filtro a "algún ítem vigente de esa unidad".
 */
describe('Listados filtrados por vehículo (ficha del vehículo)', () => {
    let saToken: string;
    let adToken: string;
    let tenantId: number;
    let vendedorId: number;
    let sucursalId: number;
    let clienteId: number;
    let v1: number;
    let v2: number;

    const nuevoVehiculo = async (): Promise<number> => {
        const r = await api.post(
            '/api/vehiculos',
            {
                marca: unique('MVO'), modelo: 'V', anio: 2021, concesionariaId: tenantId, sucursalId,
                fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO', precioCompra: 5000, precioLista: 6000,
                estado: 'publicado', origen: 'compra', moneda: 'USD',
            },
            authHeaders(saToken),
        );
        expect(r.status).toBe(201);
        return r.data.id;
    };

    const presupuestar = (vehiculoId: number) =>
        api.post(
            '/api/presupuestos',
            {
                sucursalId, clienteId, vendedorId, moneda: 'USD', fechaCreacion: '2026-10-07',
                items: [{ vehiculoId, precioLista: 6000, descuento: 0, precioFinal: 6000 }],
            },
            authHeaders(adToken),
        );

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        const ad = await loginAsAdmin();
        saToken = sa.token;
        adToken = ad.token;
        tenantId = ad.user.concesionariaId!;
        vendedorId = ad.user.id;

        const suc = await api.post('/api/sucursales', { nombre: unique('SucVO'), concesionariaId: tenantId }, authHeaders(saToken));
        expect(suc.status).toBe(201);
        sucursalId = suc.data.id;

        const cli = await api.post('/api/clientes', { nombre: unique('CliVO') }, authHeaders(adToken));
        expect(cli.status).toBe(201);
        clienteId = cli.data.id;

        v1 = await nuevoVehiculo();
        v2 = await nuevoVehiculo();
    });

    test('presupuestos?vehiculoId= trae solo los que cotizan esa unidad', async () => {
        const p1 = await presupuestar(v1);
        const p2 = await presupuestar(v2);
        expect(p1.status).toBe(201);
        expect(p2.status).toBe(201);

        const r = await api.get(`/api/presupuestos?vehiculoId=${v1}`, authHeaders(adToken));
        expect(r.status).toBe(200);
        const ids = r.data.results.map((p: { id: number }) => p.id);
        expect(ids).toContain(p1.data.id);
        expect(ids).not.toContain(p2.data.id);
        expect(r.data.totalResults).toBe(1);
    });

    test('un vehiculoId inválido no lista todos los presupuestos', async () => {
        const r = await api.get('/api/presupuestos?vehiculoId=abc', authHeaders(adToken));
        expect(r.status).toBe(200);
        expect(r.data.results).toHaveLength(0);
    });

    test('reservas y ventas también se filtran por vehículo', async () => {
        const res = await api.post(
            '/api/reservas',
            { sucursalId, vendedorId, clienteId, vehiculoId: v1, monto: 500, moneda: 'USD', fechaVencimiento: '2026-12-31' },
            authHeaders(adToken),
        );
        expect(res.status).toBe(201);

        const reservasV1 = await api.get(`/api/reservas?vehiculoId=${v1}`, authHeaders(adToken));
        const reservasV2 = await api.get(`/api/reservas?vehiculoId=${v2}`, authHeaders(adToken));
        expect(reservasV1.data.results.map((r: { id: number }) => r.id)).toContain(res.data.id);
        expect(reservasV2.data.results).toHaveLength(0);

        const venta = await api.post(
            '/api/ventas',
            {
                sucursalId, clienteId, vendedorId, vehiculoId: v1, precioVenta: 6000, moneda: 'USD',
                formaPago: 'contado', fechaVenta: '2026-10-07T00:00:00Z',
            },
            authHeaders(adToken),
        );
        expect(venta.status).toBe(201);

        const ventasV1 = await api.get(`/api/ventas?vehiculoId=${v1}`, authHeaders(adToken));
        expect(ventasV1.data.results.map((v: { id: number }) => v.id)).toContain(venta.data.id);
        expect(ventasV1.data.results[0].moneda).toBe('USD');
    });
});
