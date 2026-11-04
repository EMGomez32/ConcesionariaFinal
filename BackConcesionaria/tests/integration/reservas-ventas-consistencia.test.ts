import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * Consistencia reserva ↔ venta ↔ estado del vehículo (auditoría de seguridad, H7):
 *  - una venta no puede "convertir" la reserva de OTRO auto ni una que no está activa;
 *  - un auto reservado para otro cliente no se vende pisándole la seña (409);
 *  - la reserva del MISMO cliente que compra se consume sola;
 *  - una reserva no se "convierte" a mano por PATCH;
 *  - cancelar una reserva sigue liberando el auto cuando corresponde;
 *  - dos ventas simultáneas del mismo auto: sólo una gana;
 *  - los endpoints que iban sin validar (convertir-en-venta, transferir, pago de
 *    invoice) rechazan basura con 400.
 * Los fixtures los crea super_admin dentro del tenant del admin (como fk-cross-tenant).
 */
describe('Consistencia reserva / venta / vehículo', () => {
    let saToken: string;
    let adToken: string;
    let tenantId: number;
    let vendedorId: number;
    let sucursalId: number;
    let clienteA: number;
    let clienteB: number;

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        const ad = await loginAsAdmin();
        saToken = sa.token;
        adToken = ad.token;
        tenantId = ad.user.concesionariaId!;
        vendedorId = ad.user.id;

        const suc = await api.post('/api/sucursales', { nombre: unique('SucRV'), concesionariaId: tenantId }, authHeaders(saToken));
        expect(suc.status).toBe(201);
        sucursalId = suc.data.id;

        const a = await api.post('/api/clientes', { nombre: unique('CliA') }, authHeaders(adToken));
        const b = await api.post('/api/clientes', { nombre: unique('CliB') }, authHeaders(adToken));
        expect(a.status).toBe(201);
        expect(b.status).toBe(201);
        clienteA = a.data.id;
        clienteB = b.data.id;
    });

    async function nuevoVehiculo(): Promise<number> {
        const r = await api.post(
            '/api/vehiculos',
            {
                marca: unique('MRV'), modelo: 'V', anio: 2021, concesionariaId: tenantId, sucursalId,
                fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO', precioCompra: 5000, precioLista: 6000,
                estado: 'publicado', origen: 'compra',
            },
            authHeaders(saToken),
        );
        expect(r.status).toBe(201);
        return r.data.id;
    }

    const reservar = (vehiculoId: number, clienteId: number) =>
        api.post(
            '/api/reservas',
            { sucursalId, vendedorId, clienteId, vehiculoId, monto: 1000, moneda: 'ARS', fechaVencimiento: '2026-12-31' },
            authHeaders(adToken),
        );

    const vender = (vehiculoId: number, clienteId: number, extra: object = {}) =>
        api.post(
            '/api/ventas',
            {
                sucursalId, clienteId, vendedorId, vehiculoId, precioVenta: 6000, moneda: 'ARS',
                formaPago: 'contado', fechaVenta: '2026-04-25T00:00:00Z', ...extra,
            },
            authHeaders(adToken),
        );

    const estadoDe = async (vehiculoId: number) =>
        (await api.get(`/api/vehiculos/${vehiculoId}`, authHeaders(adToken))).data.estado as string;

    test('una venta NO puede convertir la reserva de OTRO vehículo (400 RESERVA_INVALIDA)', async () => {
        const v1 = await nuevoVehiculo();
        const v2 = await nuevoVehiculo();
        const r = await reservar(v1, clienteA);
        expect(r.status).toBe(201);

        const venta = await vender(v2, clienteA, { reservaId: r.data.id });
        expect(venta.status).toBe(400);
        expect(venta.data.error).toBe('RESERVA_INVALIDA');
        // Nada se movió: v2 sigue disponible y la reserva sigue activa.
        expect(await estadoDe(v2)).toBe('publicado');
        await tryDelete(`/api/reservas/${r.data.id}`, adToken);
    });

    test('auto reservado para OTRO cliente: la venta sin reservaId se rechaza (409) y el auto sigue reservado', async () => {
        const v = await nuevoVehiculo();
        const r = await reservar(v, clienteA);
        expect(r.status).toBe(201);
        expect(await estadoDe(v)).toBe('reservado');

        const venta = await vender(v, clienteB);
        expect(venta.status).toBe(409);
        expect(venta.data.error).toBe('VEHICULO_RESERVADO');
        expect(await estadoDe(v)).toBe('reservado');

        await tryDelete(`/api/reservas/${r.data.id}`, adToken);
    });

    test('auto reservado por el MISMO cliente: la venta consume su reserva sola', async () => {
        const v = await nuevoVehiculo();
        const r = await reservar(v, clienteA);
        expect(r.status).toBe(201);

        const venta = await vender(v, clienteA);
        expect(venta.status).toBe(201);
        expect(await estadoDe(v)).toBe('vendido');

        const res = await api.get(`/api/reservas/${r.data.id}`, authHeaders(adToken));
        expect(res.data.estado).toBe('convertida_en_venta');
    });

    test('cancelar una reserva activa sigue liberando el auto', async () => {
        const v = await nuevoVehiculo();
        const r = await reservar(v, clienteA);
        expect(r.status).toBe(201);
        expect(await estadoDe(v)).toBe('reservado');

        const del = await api.delete(`/api/reservas/${r.data.id}`, authHeaders(adToken));
        expect(del.status).toBeLessThan(300);
        expect(await estadoDe(v)).toBe('publicado');
    });

    test('una reserva no se "convierte" a mano por PATCH (400 CONVERSION_MANUAL)', async () => {
        const v = await nuevoVehiculo();
        const r = await reservar(v, clienteA);
        expect(r.status).toBe(201);

        const p = await api.patch(`/api/reservas/${r.data.id}`, { estado: 'convertida_en_venta' }, authHeaders(adToken));
        expect(p.status).toBe(400);
        expect(p.data.error).toBe('CONVERSION_MANUAL');
        expect(await estadoDe(v)).toBe('reservado');

        await tryDelete(`/api/reservas/${r.data.id}`, adToken);
    });

    test('vencer una reserva (PATCH estado=vencida) libera el auto', async () => {
        const v = await nuevoVehiculo();
        const r = await reservar(v, clienteA);
        expect(r.status).toBe(201);

        const p = await api.patch(`/api/reservas/${r.data.id}`, { estado: 'vencida' }, authHeaders(adToken));
        expect(p.status).toBe(200);
        expect(await estadoDe(v)).toBe('publicado');
    });

    test('dos ventas SIMULTÁNEAS del mismo auto: sólo una gana', async () => {
        const v = await nuevoVehiculo();
        const [a, b] = await Promise.all([vender(v, clienteA), vender(v, clienteB)]);
        expect([a.status, b.status].sort()).toEqual([201, 400]);
        expect(await estadoDe(v)).toBe('vendido');
    });

    describe('endpoints que iban sin validar', () => {
        test('convertir-en-venta con precio negativo o basura → 400 VALIDATION_ERROR', async () => {
            const negativo = await api.post('/api/presupuestos/999999999/convertir-en-venta', { precioVenta: -10 }, authHeaders(adToken));
            expect(negativo.status).toBe(400);
            expect(negativo.data.error).toBe('VALIDATION_ERROR');

            const basura = await api.post(
                '/api/presupuestos/999999999/convertir-en-venta',
                { pagos: [{ monto: -5, metodo: 'efectivo' }], formaPago: 'trueque' },
                authHeaders(adToken),
            );
            expect(basura.status).toBe(400);
            expect(basura.data.error).toBe('VALIDATION_ERROR');
        });

        test('transferir sin sucursalDestinoId → 400 VALIDATION_ERROR', async () => {
            const r = await api.post('/api/vehiculos/999999999/transferir', {}, authHeaders(adToken));
            expect(r.status).toBe(400);
            expect(r.data.error).toBe('VALIDATION_ERROR');
        });

        test('pago de invoice con monto negativo/no numérico → 400 VALIDATION_ERROR', async () => {
            for (const monto of [-5, 0, 'abc']) {
                const r = await api.post('/api/billing/invoices/999999999/payments', { monto, moneda: 'ARS', metodo: 'efectivo' }, authHeaders(adToken));
                expect(r.status).toBe(400);
                expect(r.data.error).toBe('VALIDATION_ERROR');
            }
        });
    });
});
