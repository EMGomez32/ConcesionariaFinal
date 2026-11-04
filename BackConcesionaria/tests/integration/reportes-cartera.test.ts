import { api, loginAsAdmin, loginAsSuperAdmin, login, authHeaders, unique, tryDelete } from './helpers';

/**
 * PRIV-03: los reportes de mora y de próximos vencimientos devuelven nombre, teléfono y
 * deuda de los deudores (y se exportan a CSV). El vendedor "puro" ahora ve sólo los de SU
 * cartera; el cobrador —que los necesita para cobrar— y el admin siguen viendo todo.
 */
describe('Reportes de mora y vencimientos recortados a la cartera del vendedor', () => {
    let saTok: string;
    let adTok: string;
    let clienteId: number;
    const tok: Record<string, string> = {};
    const ids: Record<string, number> = {};
    const creados: number[] = [];

    const crearUsuario = async (clave: string, rol: string) => {
        const roles = await api.get('/api/roles', authHeaders(adTok));
        const lista: any[] = roles.data.results ?? roles.data;
        const email = `${unique(clave)}@demo.com`;
        const r = await api.post('/api/usuarios', { nombre: unique(clave), email, password: 'secret12345', roleIds: [lista.find((x) => x.nombre === rol).id] }, authHeaders(adTok));
        expect(r.status).toBe(201);
        creados.push(r.data.id);
        ids[clave] = r.data.id;
        tok[clave] = (await login(email, 'secret12345')).token;
    };

    beforeAll(async () => {
        saTok = (await loginAsSuperAdmin()).token;
        const ad = await loginAsAdmin();
        adTok = ad.token;
        const tenantId = ad.user.concesionariaId!;
        await crearUsuario('vendDueno', 'vendedor');
        await crearUsuario('vendOtro', 'vendedor');
        await crearUsuario('cobra', 'cobrador');

        const suc = await api.post('/api/sucursales', { nombre: unique('SucMora'), concesionariaId: tenantId }, authHeaders(saTok));
        expect(suc.status).toBe(201);
        const cli = await api.post('/api/clientes', { nombre: unique('Deudor'), telefono: '1155550000', vendedorAsignadoId: ids.vendDueno }, authHeaders(adTok));
        expect(cli.status).toBe(201);
        clienteId = cli.data.id;

        const v = await api.post('/api/vehiculos', {
            marca: unique('MMora'), modelo: 'M', anio: 2022, concesionariaId: tenantId, sucursalId: suc.data.id,
            fechaIngreso: '2025-12-01T00:00:00Z', tipo: 'USADO', precioCompra: 9_000_000, precioLista: 14_000_000,
            estado: 'publicado', origen: 'compra', moneda: 'ARS',
        }, authHeaders(saTok));
        expect(v.status).toBe(201);
        const venta = await api.post('/api/ventas', {
            sucursalId: suc.data.id, clienteId, vendedorId: ad.user.id, vehiculoId: v.data.id, precioVenta: 14_000_000,
            moneda: 'ARS', formaPago: 'financiado_propio', fechaVenta: '2025-12-15T00:00:00Z',
        }, authHeaders(adTok));
        expect(venta.status).toBe(201);
        // Arranca hace casi un año: hay cuotas vencidas (mora) y alguna por vencer.
        const fin = await api.post('/api/financiaciones', {
            ventaId: venta.data.id, clienteId, fechaInicio: '2025-12-20', diaVencimiento: 10, moneda: 'ARS',
            montoFinanciado: 1_200_000, cuotas: 24,
        }, authHeaders(adTok));
        expect(fin.status).toBe(201);
    });

    afterAll(async () => {
        for (const id of creados) await tryDelete(`/api/usuarios/${id}`, adTok);
    });

    const clientesDe = (r: any): number[] => (r.data.items ?? r.data.results ?? []).map((i: any) => i.clienteId);

    test('mora: el vendedor del cliente lo ve, OTRO vendedor no, el cobrador y el admin sí', async () => {
        const dueno = await api.get('/api/reportes/mora', authHeaders(tok.vendDueno));
        expect(dueno.status).toBe(200);
        expect(clientesDe(dueno)).toContain(clienteId);

        const otro = await api.get('/api/reportes/mora', authHeaders(tok.vendOtro));
        expect(otro.status).toBe(200);
        expect(clientesDe(otro)).not.toContain(clienteId);

        expect(clientesDe(await api.get('/api/reportes/mora', authHeaders(tok.cobra)))).toContain(clienteId);
        expect(clientesDe(await api.get('/api/reportes/mora', authHeaders(adTok)))).toContain(clienteId);
    });

    test('próximos vencimientos: mismo recorte', async () => {
        const q = '/api/reportes/proximos-vencimientos?dias=60';
        expect(clientesDe(await api.get(q, authHeaders(tok.vendDueno)))).toContain(clienteId);
        expect(clientesDe(await api.get(q, authHeaders(tok.vendOtro)))).not.toContain(clienteId);
        expect(clientesDe(await api.get(q, authHeaders(tok.cobra)))).toContain(clienteId);
    });
});
