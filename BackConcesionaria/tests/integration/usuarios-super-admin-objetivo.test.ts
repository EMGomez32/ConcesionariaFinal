import { api, loginAsAdmin, loginAsSuperAdmin, login, authHeaders, unique, tryDelete } from './helpers';

const ADMIN_PASS = 'admin123';
const SUPER_PASS = 'super123';

/**
 * APP-02: la cuenta de un super_admin sólo la administra otro super_admin. Un admin de
 * tenant que la ve (porque está asociada a su concesionaria) no puede cambiarle el email,
 * resetearle la contraseña o el 2FA, quitarle roles, desactivarla ni borrarla.
 *
 * Se ataca a un super_admin CREADO por el test (no al del seed): si el candado fallara, el
 * test no deja a la suite sin su cuenta de plataforma.
 */
describe('Un admin de tenant no puede gestionar a un super_admin', () => {
    let saTok: string;
    let adTok: string;
    let victimaId: number;
    let victimaEmail: string;
    const VICTIMA_PASS = 'clave-de-plataforma-123';
    let rolVendedorId: number;

    beforeAll(async () => {
        saTok = (await loginAsSuperAdmin()).token;
        const ad = await loginAsAdmin();
        adTok = ad.token;
        const roles = await api.get('/api/roles', authHeaders(saTok));
        const lista: any[] = roles.data.results ?? roles.data;
        const rolSuper = lista.find((r) => r.nombre === 'super_admin').id;
        rolVendedorId = lista.find((r) => r.nombre === 'vendedor').id;

        victimaEmail = `${unique('plataforma')}@demo.com`;
        const alta = await api.post('/api/usuarios', {
            nombre: unique('SuperVictima'), email: victimaEmail, password: VICTIMA_PASS,
            roleIds: [rolSuper], concesionariaId: ad.user.concesionariaId,
        }, authHeaders(saTok));
        expect(alta.status).toBe(201);
        victimaId = alta.data.id;
        // El admin la ve (mismo tenant): es exactamente el escenario del hallazgo.
        expect((await api.get(`/api/usuarios/${victimaId}`, authHeaders(adTok))).status).toBe(200);
    });

    afterAll(async () => { await tryDelete(`/api/usuarios/${victimaId}`, saTok); });

    const esperar403 = (r: any) => {
        expect({ status: r.status, error: r.data?.error }).toEqual({ status: 403, error: 'TARGET_NOT_MANAGEABLE' });
    };

    test('cambiarle el email → 403', async () => {
        esperar403(await api.patch(`/api/usuarios/${victimaId}`, { email: `${unique('robo')}@demo.com`, currentPassword: ADMIN_PASS }, authHeaders(adTok)));
    });

    test('quitarle el rol (reasignar roles) → 403', async () => {
        esperar403(await api.patch(`/api/usuarios/${victimaId}`, { roleIds: [rolVendedorId] }, authHeaders(adTok)));
    });

    test('desactivarlo → 403', async () => {
        esperar403(await api.patch(`/api/usuarios/${victimaId}`, { activo: false }, authHeaders(adTok)));
    });

    test('resetearle la contraseña → 403', async () => {
        esperar403(await api.post(`/api/usuarios/${victimaId}/reset-password`, { password: 'tomada-por-el-admin-1', currentPassword: ADMIN_PASS }, authHeaders(adTok)));
    });

    test('resetearle el 2FA → 403', async () => {
        esperar403(await api.post(`/api/usuarios/${victimaId}/2fa/reset`, { currentPassword: ADMIN_PASS }, authHeaders(adTok)));
    });

    test('borrarlo → 403', async () => {
        esperar403(await api.delete(`/api/usuarios/${victimaId}`, authHeaders(adTok)));
    });

    test('después de todo eso la cuenta sigue intacta: entra con su contraseña y conserva el rol', async () => {
        const s = await login(victimaEmail, VICTIMA_PASS);
        expect(s.user.roles).toContain('super_admin');
        expect(s.user.email).toBe(victimaEmail);
    });

    test('otro super_admin SÍ puede gestionarla (con su propia contraseña)', async () => {
        const r = await api.post(`/api/usuarios/${victimaId}/reset-password`, { password: 'reseteada-por-super-1', currentPassword: SUPER_PASS }, authHeaders(saTok));
        expect(r.status).toBe(204);
    });
});
