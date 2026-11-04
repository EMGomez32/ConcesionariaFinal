import { api, loginAsAdmin, authHeaders, unique, tryDelete } from './helpers';

const ADMIN_PASS = 'admin123';

/**
 * APP-04 (step-up): resetear la contraseña o el 2FA de otro y cambiarle el email piden la
 * contraseña del ACTOR. Con una sesión robada sola no se toma ninguna cuenta.
 */
describe('Step-up: acciones sobre la cuenta de otro piden la contraseña del actor', () => {
    let adTok: string;
    let u: { id: number; email: string };
    const PASS = 'clave-del-usuario-123';

    beforeAll(async () => {
        adTok = (await loginAsAdmin()).token;
        const email = `${unique('stepup')}@demo.com`;
        const r = await api.post('/api/usuarios', { nombre: unique('StepUp'), email, password: PASS, roleIds: [] }, authHeaders(adTok));
        expect(r.status).toBe(201);
        u = { id: r.data.id, email };
    });

    afterAll(async () => { await tryDelete(`/api/usuarios/${u.id}`, adTok); });

    test('reset de contraseña: sin la contraseña del actor 400, con una incorrecta 400 y nada cambia', async () => {
        const sin = await api.post(`/api/usuarios/${u.id}/reset-password`, { password: 'nueva-clave-12345' }, authHeaders(adTok));
        expect(sin.status).toBe(400);
        const mal = await api.post(`/api/usuarios/${u.id}/reset-password`, { password: 'nueva-clave-12345', currentPassword: 'no-es-la-mia' }, authHeaders(adTok));
        expect({ status: mal.status, error: mal.data.error }).toEqual({ status: 400, error: 'INVALID_CURRENT_PASSWORD' });
        // La contraseña del usuario sigue siendo la original.
        expect((await api.post('/api/auth/login', { email: u.email, password: PASS })).status).toBe(200);
    });

    test('reset de contraseña con la contraseña del actor → 204', async () => {
        const ok = await api.post(`/api/usuarios/${u.id}/reset-password`, { password: 'nueva-clave-12345', currentPassword: ADMIN_PASS }, authHeaders(adTok));
        expect(ok.status).toBe(204);
        expect((await api.post('/api/auth/login', { email: u.email, password: 'nueva-clave-12345' })).status).toBe(200);
    });

    test('reset del 2FA: sin / con contraseña incorrecta 400; con la correcta 204', async () => {
        expect((await api.post(`/api/usuarios/${u.id}/2fa/reset`, {}, authHeaders(adTok))).status).toBe(400);
        expect((await api.post(`/api/usuarios/${u.id}/2fa/reset`, { currentPassword: 'no-es-la-mia' }, authHeaders(adTok))).status).toBe(400);
        expect((await api.post(`/api/usuarios/${u.id}/2fa/reset`, { currentPassword: ADMIN_PASS }, authHeaders(adTok))).status).toBe(204);
    });

    test('cambiar el email de otro: sin contraseña 400 STEP_UP_REQUIRED; con la correcta 200', async () => {
        const nuevo = `${unique('nuevo')}@demo.com`;
        const sin = await api.patch(`/api/usuarios/${u.id}`, { email: nuevo }, authHeaders(adTok));
        expect({ status: sin.status, error: sin.data.error }).toEqual({ status: 400, error: 'STEP_UP_REQUIRED' });
        const mal = await api.patch(`/api/usuarios/${u.id}`, { email: nuevo, currentPassword: 'no-es-la-mia' }, authHeaders(adTok));
        expect(mal.status).toBe(400);
        expect((await api.get(`/api/usuarios/${u.id}`, authHeaders(adTok))).data.email).toBe(u.email);

        const ok = await api.patch(`/api/usuarios/${u.id}`, { email: nuevo, currentPassword: ADMIN_PASS }, authHeaders(adTok));
        expect(ok.status).toBe(200);
        expect(ok.data.email).toBe(nuevo);
        expect(ok.data.currentPassword).toBeUndefined();
        u.email = nuevo;
    });

    test('editar otros datos (o reenviar el MISMO email, como hace el form) no pide contraseña', async () => {
        const r = await api.patch(`/api/usuarios/${u.id}`, { nombre: unique('Renombrado'), email: u.email }, authHeaders(adTok));
        expect(r.status).toBe(200);
    });
});
