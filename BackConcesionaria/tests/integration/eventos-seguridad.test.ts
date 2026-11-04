import { api, loginAsAdmin, loginAsSuperAdmin, login, authHeaders, unique, tryDelete } from './helpers';

/**
 * APP-07: lo que antes pasaba en silencio ahora deja rastro en security_events (que lee
 * super_admin por GET /security-events):
 *  - el REUSO de un refresh token ya rotado (sesión robada),
 *  - las denegaciones de authorize (deduplicadas por usuario + ruta),
 *  - el login de un super_admin.
 * El envío al webhook de alertas se prueba en tests/unit/alertasSeguridad.test.ts.
 */
describe('Eventos de seguridad: reuso de refresh, denegaciones y login de super_admin', () => {
    let saTok: string;
    let adTok: string;
    let u: { id: number; email: string };
    const PASS = 'clave-eventos-12345';

    const eventos = async (accion: string) => {
        const r = await api.get(`/api/security-events?accion=${accion}&limit=500`, authHeaders(saTok));
        expect(r.status).toBe(200);
        return r.data.results as Array<{ accion: string; usuarioId: number | null; detalle: string | null }>;
    };

    beforeAll(async () => {
        saTok = (await loginAsSuperAdmin()).token;
        adTok = (await loginAsAdmin()).token;
        const roles = await api.get('/api/roles', authHeaders(adTok));
        const lista: any[] = roles.data.results ?? roles.data;
        const rolVendedor = lista.find((r) => r.nombre === 'vendedor').id;
        const email = `${unique('evt')}@demo.com`;
        const r = await api.post('/api/usuarios', { nombre: unique('Evt'), email, password: PASS, roleIds: [rolVendedor] }, authHeaders(adTok));
        expect(r.status).toBe(201);
        u = { id: r.data.id, email };
    });

    afterAll(async () => { await tryDelete(`/api/usuarios/${u.id}`, adTok); });

    test('reusar un refresh ya rotado → 401 y queda un `refresh_reuse` del usuario', async () => {
        const l = await api.post('/api/auth/login', { email: u.email, password: PASS });
        expect(l.status).toBe(200);
        const viejo = l.data.tokens.refresh;
        const rotado = await api.post('/api/auth/refresh', { refreshToken: viejo });
        expect(rotado.status).toBe(200);

        const reuso = await api.post('/api/auth/refresh', { refreshToken: viejo });
        expect(reuso.status).toBe(401);

        const filas = (await eventos('refresh_reuse')).filter((e) => e.usuarioId === u.id);
        expect(filas.length).toBeGreaterThanOrEqual(1);
        // Y la detección hizo su trabajo: la cadena nueva también quedó revocada.
        expect((await api.post('/api/auth/refresh', { refreshToken: rotado.data.refresh })).status).toBe(401);
    });

    test('las denegaciones de authorize quedan registradas UNA vez por usuario y ruta', async () => {
        const vend = await login(u.email, PASS);
        // Tres intentos contra la misma ruta prohibida (DELETE /usuarios/:id es de admin).
        for (let i = 0; i < 3; i++) {
            expect((await api.delete(`/api/usuarios/${u.id + 100000 + i}`, authHeaders(vend.token))).status).toBe(403);
        }
        const filas = (await eventos('authorize_denied')).filter((e) => e.usuarioId === u.id && (e.detalle ?? '').includes('DELETE /api/usuarios/:id'));
        expect(filas).toHaveLength(1);
    });

    test('un login de super_admin deja `login_super_admin`', async () => {
        const total = async () => (await api.get('/api/security-events?accion=login_super_admin&limit=1', authHeaders(saTok))).data.totalResults as number;
        const antes = await total();
        await loginAsSuperAdmin();
        expect(await total()).toBeGreaterThan(antes);
        const ultimo = (await eventos('login_super_admin'))[0];
        expect(ultimo.usuarioId).toBeTruthy();
    });
});
