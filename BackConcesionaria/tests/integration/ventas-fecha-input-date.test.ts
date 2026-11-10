import { api, loginAsSuperAdmin, concesionariaDeTest, authHeaders, unique, anularVenta } from './helpers';

/**
 * El front manda las fechas de venta y de pago desde un <input type="date">, o sea
 * "YYYY-MM-DD". Prisma rechaza ese string para un DateTime, y como el use-case lo
 * pasaba crudo, registrar una venta, convertir un presupuesto y agregar un pago
 * devolvían 500 desde la UI. Los demás tests mandan ISO completo
 * ("...T00:00:00Z"), por eso nunca lo vieron. Estos usan el formato real del front.
 */
describe('Ventas con fecha "YYYY-MM-DD" (formato del <input type="date">)', () => {
    let token: string;
    let concesionariaId: number;
    const creados: { ventas: number[]; vehiculos: number[]; clientes: number[]; presupuestos: number[] } = {
        ventas: [], vehiculos: [], clientes: [], presupuestos: [],
    };

    const nuevoVehiculo = async () => {
        const id = (await api.post('/api/vehiculos', {
            marca: unique('M'), modelo: 'Fecha', anio: 2021, concesionariaId, sucursalId: 1,
            fechaIngreso: '2026-04-20', tipo: 'USADO',
            precioCompra: 5000, precioLista: 6000, estado: 'publicado', origen: 'compra',
        }, authHeaders(token))).data.id;
        creados.vehiculos.push(id);
        return id;
    };

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        token = sa.token;
        concesionariaId = await concesionariaDeTest();
        const cli = await api.post('/api/clientes', { nombre: unique('Cli'), concesionariaId }, authHeaders(token));
        creados.clientes.push(cli.data.id);
    });

    afterAll(async () => {
        for (const id of creados.ventas) await anularVenta(id, token);
        for (const id of creados.presupuestos) await api.delete(`/api/presupuestos/${id}`, authHeaders(token));
        for (const id of creados.vehiculos) await api.delete(`/api/vehiculos/${id}`, authHeaders(token));
        for (const id of creados.clientes) await api.delete(`/api/clientes/${id}`, authHeaders(token));
    });

    test('POST /ventas con fechaVenta "YYYY-MM-DD" crea la venta (antes 500)', async () => {
        const vehId = await nuevoVehiculo();
        const res = await api.post('/api/ventas', {
            sucursalId: 1, clienteId: creados.clientes[0], vendedorId: 2,
            vehiculoId: vehId, precioVenta: 6000, moneda: 'ARS',
            formaPago: 'contado', fechaVenta: '2026-04-25',
            pagos: [{ monto: 6000, metodo: 'transferencia', fecha: '2026-04-25' }],
        }, authHeaders(token));
        expect(res.status).toBe(201);
        creados.ventas.push(res.data.id);
        expect(String(res.data.fechaVenta).slice(0, 10)).toBe('2026-04-25');

        // Agregar un pago a la venta ya creada, también con fecha del input date.
        const pago = await api.post(
            `/api/ventas/${res.data.id}/pagos`,
            { monto: 100, metodo: 'efectivo', fecha: '2026-04-26' },
            authHeaders(token),
        );
        expect(pago.status).toBe(201);
    });

    test('Convertir un presupuesto aceptado en venta con fechaVenta "YYYY-MM-DD" (antes 500)', async () => {
        const vehId = await nuevoVehiculo();
        const pres = await api.post('/api/presupuestos', {
            nroPresupuesto: unique('P'), concesionariaId, sucursalId: 1, clienteId: creados.clientes[0], vendedorId: 2,
            moneda: 'ARS', fechaCreacion: '2026-04-20',
            items: [{ vehiculoId: vehId, precioLista: 6000, descuento: 0, precioFinal: 6000 }],
        }, authHeaders(token));
        expect(pres.status).toBe(201);
        creados.presupuestos.push(pres.data.id);
        await api.patch(`/api/presupuestos/${pres.data.id}`, { estado: 'enviado' }, authHeaders(token));
        await api.patch(`/api/presupuestos/${pres.data.id}`, { estado: 'aceptado' }, authHeaders(token));

        const venta = await api.post(`/api/presupuestos/${pres.data.id}/convertir-en-venta`, {
            formaPago: 'contado', moneda: 'ARS', fechaVenta: '2026-04-27',
        }, authHeaders(token));
        expect(venta.status).toBe(201);
        creados.ventas.push(venta.data.id);
        expect(String(venta.data.fechaVenta).slice(0, 10)).toBe('2026-04-27');
    });

    test('Una fecha imposible devuelve 400 de validación, no 500', async () => {
        const vehId = await nuevoVehiculo();
        const res = await api.post('/api/ventas', {
            sucursalId: 1, clienteId: creados.clientes[0], vendedorId: 2,
            vehiculoId: vehId, precioVenta: 6000, moneda: 'ARS',
            formaPago: 'contado', fechaVenta: '2026-13-45',
        }, authHeaders(token));
        expect(res.status).toBe(400);
    });
});
