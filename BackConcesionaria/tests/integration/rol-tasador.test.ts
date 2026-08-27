import { api, loginAsAdmin, login, authHeaders, unique, tryDelete } from './helpers';

/**
 * Rol `tasador`: un puesto acotado que SÓLO valúa usados.
 *
 * Contrato:
 *  - Puede ver, crear y COMPLETAR tasaciones — y ponerle el valor AUNQUE la casa
 *    tenga `tasacionSoloTasador` activo (ahí un vendedor no puede: 403).
 *  - No puede nada más: clientes, atenciones, ventas → 403. Tampoco borrar
 *    tasaciones ("sólo tasar").
 */
describe('Rol tasador — sólo valúa usados', () => {
    let adminToken: string;
    let tenantId: number;
    let tasadorTok: string;
    let vendedorTok: string;
    const creados: number[] = [];

    const crearUsuario = async (rol: string, adminTok: string) => {
        const roles = await api.get('/api/roles', authHeaders(adminTok));
        const lista: any[] = roles.data.results ?? roles.data;
        const rolId = lista.find((r) => r.nombre === rol)?.id;
        expect(rolId).toBeTruthy();
        const email = `${unique(rol)}@demo.com`;
        const pass = 'secret123';
        const res = await api.post('/api/usuarios', { nombre: unique(rol), email, password: pass, roleIds: [rolId] }, authHeaders(adminTok));
        expect(res.status).toBe(201);
        creados.push(res.data.id);
        const sess = await login(email, pass);
        return sess.token;
    };

    beforeAll(async () => {
        const ad = await loginAsAdmin();
        adminToken = ad.token;
        tenantId = ad.user.concesionariaId!;
        // La casa restringe la tasación al tasador: es el escenario donde el rol importa.
        const flag = await api.patch(`/api/concesionarias/${tenantId}`, { tasacionSoloTasador: true }, authHeaders(adminToken));
        expect(flag.status).toBe(200);
        tasadorTok = await crearUsuario('tasador', adminToken);
        vendedorTok = await crearUsuario('vendedor', adminToken);
    });

    afterAll(async () => {
        await api.patch(`/api/concesionarias/${tenantId}`, { tasacionSoloTasador: false }, authHeaders(adminToken));
        for (const id of creados) await tryDelete(`/api/usuarios/${id}`, adminToken);
    });

    test('el tasador VE las tasaciones (GET 200)', async () => {
        const res = await api.get('/api/tasaciones', authHeaders(tasadorTok));
        expect(res.status).toBe(200);
    });

    test('el tasador puede TASAR una pendiente aunque tasacionSoloTasador esté activo', async () => {
        // Alta pendiente (por el admin), sin valor.
        const alta = await api.post('/api/tasaciones',
            { marca: 'VW', modelo: unique('Gol'), fecha: '2026-08-27', dominio: unique('AB').slice(0, 8) },
            authHeaders(adminToken));
        expect(alta.status).toBe(201);
        const id = alta.data.id;

        // El VENDEDOR no puede ponerle valor (la casa lo restringe): 403.
        const vend = await api.patch(`/api/tasaciones/${id}`, { valorEstimado: 5000000 }, authHeaders(vendedorTok));
        expect(vend.status).toBe(403);

        // El TASADOR sí: 200, y queda con el valor.
        const tas = await api.patch(`/api/tasaciones/${id}`, { valorEstimado: 5000000 }, authHeaders(tasadorTok));
        expect(tas.status).toBe(200);
        expect(Number(tas.data.valorEstimado)).toBe(5000000);

        await tryDelete(`/api/tasaciones/${id}`, adminToken);
    });

    test('el tasador puede CREAR una tasación (POST 201)', async () => {
        const res = await api.post('/api/tasaciones',
            { marca: 'Fiat', modelo: unique('Cronos'), fecha: '2026-08-27', dominio: unique('CD').slice(0, 8), valorEstimado: 7000000 },
            authHeaders(tasadorTok));
        expect(res.status).toBe(201);
        await tryDelete(`/api/tasaciones/${res.data.id}`, adminToken);
    });

    test('el tasador NO puede vender, crear clientes ni abrir atenciones (403)', async () => {
        // Las ESCRITURAS del vendedor y todo el módulo de atenciones lo excluyen.
        // (Las lecturas abiertas —clientes, stock— siguen el mismo modelo que el
        // resto de los roles: las cierra el front, no un gate por rol.)
        expect((await api.get('/api/atenciones', authHeaders(tasadorTok))).status).toBe(403);
        expect((await api.post('/api/clientes', { nombre: unique('x') }, authHeaders(tasadorTok))).status).toBe(403);
        expect((await api.post('/api/ventas', {}, authHeaders(tasadorTok))).status).toBe(403);
    });

    test('el tasador NO puede borrar una tasación (403)', async () => {
        const alta = await api.post('/api/tasaciones',
            { marca: 'Ford', modelo: unique('Ka'), fecha: '2026-08-27', dominio: unique('EF').slice(0, 8) },
            authHeaders(adminToken));
        const id = alta.data.id;
        const del = await api.delete(`/api/tasaciones/${id}`, authHeaders(tasadorTok));
        expect(del.status).toBe(403);
        await tryDelete(`/api/tasaciones/${id}`, adminToken);
    });
});
