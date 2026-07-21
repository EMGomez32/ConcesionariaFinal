import { api, loginAsSuperAdmin, authHeaders, unique } from './helpers';

describe('Sub-recursos de venta + trigger Postgres', () => {
    let token: string;
    let concesionariaId: number;
    let ventaId: number;
    let vehId: number;
    let cliId: number;

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        token = sa.token;
        concesionariaId = sa.user.concesionariaId!;

        cliId = (await api.post('/api/clientes', { nombre: unique('Cli'), concesionariaId }, authHeaders(token))).data.id;
        vehId = (await api.post('/api/vehiculos', {
            marca: unique('M'), modelo: 'V', anio: 2020, concesionariaId, sucursalId: 1,
            fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO',
            precioCompra: 5000, precioLista: 6000, estado: 'publicado', origen: 'compra',
        }, authHeaders(token))).data.id;
        ventaId = (await api.post('/api/ventas', {
            sucursalId: 1, clienteId: cliId, vendedorId: 2,
            vehiculoId: vehId, precioVenta: 6000, moneda: 'ARS',
            formaPago: 'contado', fechaVenta: '2026-04-25T00:00:00Z',
        }, authHeaders(token))).data.id;
    });

    afterAll(async () => {
        await api.delete(`/api/ventas/${ventaId}`, authHeaders(token));
        await api.delete(`/api/vehiculos/${vehId}`, authHeaders(token));
        await api.delete(`/api/clientes/${cliId}`, authHeaders(token));
    });

    test('Agregar pago sin pasar concesionariaId — el trigger Postgres lo deriva del padre', async () => {
        const res = await api.post(
            `/api/ventas/${ventaId}/pagos`,
            { monto: 1000, metodo: 'efectivo' },
            authHeaders(token)
        );
        expect(res.status).toBe(201);
        // El trigger BEFORE INSERT pobla concesionaria_id desde la venta padre
        expect(res.data.concesionariaId).toBe(concesionariaId);

        // Listar pagos
        const list = await api.get(`/api/ventas/${ventaId}/pagos`, authHeaders(token));
        expect(list.data).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: res.data.id, monto: '1000' }),
        ]));

        // Soft-delete el pago
        await api.delete(`/api/ventas/${ventaId}/pagos/${res.data.id}`, authHeaders(token));
        const after = await api.get(`/api/ventas/${ventaId}/pagos`, authHeaders(token));
        const ids = after.data.map((p: any) => p.id);
        expect(ids).not.toContain(res.data.id);
    });

    test('Agregar extra y canje también funcionan con trigger', async () => {
        const extra = await api.post(
            `/api/ventas/${ventaId}/extras`,
            { descripcion: 'patentamiento', monto: 200 },
            authHeaders(token)
        );
        expect(extra.status).toBe(201);
        expect(extra.data.concesionariaId).toBe(concesionariaId);

        // Cleanup
        await api.delete(`/api/ventas/${ventaId}/extras/${extra.data.id}`, authHeaders(token));
    });

    test('PATCH /ventas/:id/estado-entrega aplica state machine + setea fechaEntrega al entregar', async () => {
        // pendiente → autorizada → entregada
        const auth = await api.patch(
            `/api/ventas/${ventaId}/estado-entrega`,
            { estadoEntrega: 'autorizada' },
            authHeaders(token)
        );
        expect(auth.status).toBe(200);

        const entr = await api.patch(
            `/api/ventas/${ventaId}/estado-entrega`,
            { estadoEntrega: 'entregada' },
            authHeaders(token)
        );
        expect(entr.status).toBe(200);
        expect(entr.data.fechaEntrega).not.toBeNull();

        // entregada es terminal — siguiente transición debe fallar 422
        const fail = await api.patch(
            `/api/ventas/${ventaId}/estado-entrega`,
            { estadoEntrega: 'pendiente' },
            authHeaders(token)
        );
        expect(fail.status).toBe(422);
    });
});
