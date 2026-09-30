import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * Paginación acotada y orden seguro (auditoría de seguridad, H4):
 *  - `?limit=1000000` ya no trae toda la tabla (se recorta al tope);
 *  - `limit`/`page` inválidos caen al default en vez de dar 500;
 *  - `sortBy` desconocido o sensible (passwordHash) no rompe ni sirve de oráculo;
 *  - un no-admin no puede reconstruir el padrón de emails filtrando por email.
 * Los limiters de tasa NO se prueban acá: se apagan con NODE_ENV=test. Van en
 * tests/unit/rateLimiters.test.ts.
 */
describe('Paginación y orden', () => {
    let adminToken: string;
    let saToken: string;

    beforeAll(async () => {
        adminToken = (await loginAsAdmin()).token;
        saToken = (await loginAsSuperAdmin()).token;
    });

    test('limit gigante se recorta al tope (2000)', async () => {
        const r = await api.get('/api/proveedores?limit=1000000', authHeaders(adminToken));
        expect(r.status).toBe(200);
        expect(r.data.limit).toBe(2000);
    });

    test('lo que el front pide hoy (limit=1000) NO se trunca', async () => {
        const r = await api.get('/api/proveedores?limit=1000', authHeaders(adminToken));
        expect(r.status).toBe(200);
        expect(r.data.limit).toBe(1000);
    });

    test.each(['-5', '0', 'abc'])('limit inválido (%s) cae al default en vez de dar 500', async (limit) => {
        const r = await api.get(`/api/proveedores?limit=${limit}`, authHeaders(adminToken));
        expect(r.status).toBe(200);
        expect(r.data.limit).toBe(20);
    });

    test('page inválida cae a 1', async () => {
        const r = await api.get('/api/proveedores?page=-3', authHeaders(adminToken));
        expect(r.status).toBe(200);
        expect(r.data.page).toBe(1);
    });

    test('sortBy=passwordHash NO rompe ni ordena por el hash (200)', async () => {
        const r = await api.get('/api/usuarios?sortBy=passwordHash', authHeaders(adminToken));
        expect(r.status).toBe(200);
        // La respuesta nunca incluye el hash, ordene o no por él.
        for (const u of r.data.results) expect(u).not.toHaveProperty('passwordHash');
    });

    test.each(['cliente', 'columna_que_no_existe', '__proto__'])('sortBy inválido (%s) da 200, no 500', async (sortBy) => {
        for (const ruta of ['ventas', 'clientes', 'usuarios', 'reservas']) {
            const r = await api.get(`/api/${ruta}?sortBy=${sortBy}`, authHeaders(adminToken));
            expect(r.status).toBe(200);
        }
    });

    test('sortBy válido sigue funcionando (asc y desc)', async () => {
        const asc = await api.get('/api/usuarios?sortBy=nombre&sortOrder=asc', authHeaders(adminToken));
        const desc = await api.get('/api/usuarios?sortBy=nombre&sortOrder=desc', authHeaders(adminToken));
        expect(asc.status).toBe(200);
        expect(desc.status).toBe(200);
        const nombres = (r: any) => r.data.results.map((u: any) => u.nombre);
        expect(nombres(asc)).toEqual([...nombres(desc)].reverse());
    });

    describe('GET /usuarios: el filtro por email es sólo para admin', () => {
        const PASS = 'secret123';
        const ids: number[] = [];
        let fragmento: string;
        let noAdminToken: string;

        beforeAll(async () => {
            fragmento = unique('zzbusca').replace(/[^a-z0-9]/gi, '');
            // Usuario "objetivo" cuyo email contiene el fragmento.
            const a = await api.post(
                '/api/usuarios',
                { nombre: unique('Objetivo'), email: `${fragmento}@demo.com`, password: PASS, roleIds: [] },
                authHeaders(adminToken),
            );
            expect(a.status).toBe(201);
            ids.push(a.data.id);

            // Usuario sin roles (no-admin): puede llamar a GET /usuarios (sólo authenticate).
            const emailB = `${unique('noadmin')}@demo.com`;
            const b = await api.post(
                '/api/usuarios',
                { nombre: unique('NoAdmin'), email: emailB, password: PASS, roleIds: [] },
                authHeaders(adminToken),
            );
            expect(b.status).toBe(201);
            ids.push(b.data.id);
            const login = await api.post('/api/auth/login', { email: emailB, password: PASS });
            expect(login.status).toBe(200);
            noAdminToken = login.data.tokens.access;
        });

        afterAll(async () => {
            for (const id of ids) await tryDelete(`/api/usuarios/${id}`, saToken);
        });

        test('el admin SÍ filtra por email', async () => {
            const r = await api.get(`/api/usuarios?email=${fragmento}`, authHeaders(adminToken));
            expect(r.status).toBe(200);
            expect(r.data.results).toHaveLength(1);
            expect(r.data.results[0].email).toContain(fragmento);
        });

        test('el no-admin NO puede usar el filtro como oráculo: se ignora y no ve emails', async () => {
            const r = await api.get(`/api/usuarios?email=${fragmento}`, authHeaders(noAdminToken));
            expect(r.status).toBe(200);
            // Con el filtro ignorado devuelve el listado completo del tenant (≥ 2 usuarios),
            // no sólo al que coincide: no distingue quién matchea el fragmento.
            expect(r.data.results.length).toBeGreaterThan(1);
            for (const u of r.data.results) expect(u).not.toHaveProperty('email');
        });
    });
});
