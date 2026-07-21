import { api, loginAsSuperAdmin, authHeaders, unique } from './helpers';

describe('State machines (transiciones inválidas → 422)', () => {
    let token: string;
    let concesionariaId: number;

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        token = sa.token;
        concesionariaId = sa.user.concesionariaId!;
    });

    test('Vehículo: transición válida preparacion → publicado', async () => {
        const veh = await api.post(
            '/api/vehiculos',
            {
                marca: unique('Marca'), modelo: 'X', anio: 2020,
                concesionariaId, sucursalId: 1,
                fechaIngreso: '2026-04-25T00:00:00Z',
                tipo: 'USADO', precioCompra: 1000, precioLista: 1500,
                estado: 'preparacion', origen: 'compra',
            },
            authHeaders(token)
        );
        const id = veh.data.id;

        const upd = await api.patch(`/api/vehiculos/${id}`, { estado: 'publicado' }, authHeaders(token));
        expect(upd.status).toBe(200);
        expect(upd.data.estado).toBe('publicado');

        await api.delete(`/api/vehiculos/${id}`, authHeaders(token));
    });

    test('Vehículo: transición inválida vendido → publicado devuelve 422', async () => {
        const veh = await api.post(
            '/api/vehiculos',
            {
                marca: unique('Marca'), modelo: 'Y', anio: 2020,
                concesionariaId, sucursalId: 1,
                fechaIngreso: '2026-04-25T00:00:00Z',
                tipo: 'USADO', precioCompra: 1000, precioLista: 1500,
                estado: 'preparacion', origen: 'compra',
            },
            authHeaders(token)
        );
        const id = veh.data.id;

        // preparacion → publicado → vendido (válido)
        await api.patch(`/api/vehiculos/${id}`, { estado: 'publicado' }, authHeaders(token));
        await api.patch(`/api/vehiculos/${id}`, { estado: 'vendido' }, authHeaders(token));

        // vendido → publicado (inválido)
        const upd = await api.patch(`/api/vehiculos/${id}`, { estado: 'publicado' }, authHeaders(token));
        expect(upd.status).toBe(422);

        await api.delete(`/api/vehiculos/${id}`, authHeaders(token));
    });

    test('Postventa: cambio a resuelto setea fechaCierre automáticamente', async () => {
        // Crear contexto: cliente, vehículo, venta
        const cli = await api.post('/api/clientes', { nombre: unique('Cli'), concesionariaId }, authHeaders(token));
        const veh = await api.post('/api/vehiculos', {
            marca: unique('M'), modelo: 'Z', anio: 2020, concesionariaId, sucursalId: 1,
            fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO',
            precioCompra: 1000, precioLista: 1500, estado: 'publicado', origen: 'compra',
        }, authHeaders(token));
        const venta = await api.post('/api/ventas', {
            sucursalId: 1, clienteId: cli.data.id, vendedorId: 2,
            vehiculoId: veh.data.id, precioVenta: 1500, moneda: 'ARS',
            formaPago: 'contado', fechaVenta: '2026-04-25T00:00:00Z',
        }, authHeaders(token));

        const caso = await api.post('/api/postventa-casos', {
            sucursalId: 1, ventaId: venta.data.id, vehiculoId: veh.data.id,
            clienteId: cli.data.id, fechaReclamo: '2026-04-25T00:00:00Z',
            tipo: 'mecanico', descripcion: 'test caso', concesionariaId,
        }, authHeaders(token));
        expect(caso.status).toBe(201);
        expect(caso.data.fechaCierre).toBeNull();

        const upd = await api.patch(
            `/api/postventa-casos/${caso.data.id}`,
            { estado: 'resuelto' },
            authHeaders(token)
        );
        expect(upd.status).toBe(200);
        expect(upd.data.fechaCierre).not.toBeNull();

        // Cleanup
        await api.delete(`/api/postventa-casos/${caso.data.id}`, authHeaders(token));
        await api.delete(`/api/ventas/${venta.data.id}`, authHeaders(token));
        await api.delete(`/api/vehiculos/${veh.data.id}`, authHeaders(token));
        await api.delete(`/api/clientes/${cli.data.id}`, authHeaders(token));
    });
});
