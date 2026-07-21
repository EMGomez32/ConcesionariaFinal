import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders } from './helpers';

describe('Auth', () => {
    test('login con credenciales válidas devuelve user + tokens', async () => {
        const res = await api.post('/api/auth/login', {
            email: 'superadmin@demo.com',
            password: 'super123',
        });

        expect(res.status).toBe(200);
        expect(res.data.user).toMatchObject({
            email: 'superadmin@demo.com',
            roles: expect.arrayContaining(['super_admin']),
        });
        expect(typeof res.data.tokens.access).toBe('string');
        expect(typeof res.data.tokens.refresh).toBe('string');
    });

    test('login con password incorrecta devuelve 401', async () => {
        const res = await api.post('/api/auth/login', {
            email: 'superadmin@demo.com',
            password: 'mal-password',
        });

        expect(res.status).toBe(401);
    });

    test('login con email inexistente devuelve 401', async () => {
        const res = await api.post('/api/auth/login', {
            email: 'nadie@nowhere.com',
            password: 'cualquiera',
        });

        expect(res.status).toBe(401);
    });

    test('admin login devuelve rol admin', async () => {
        const session = await loginAsAdmin();
        expect(session.user.roles).toContain('admin');
        expect(session.user.roles).not.toContain('super_admin');
    });

    test('reset password actualiza la contraseña y permite login con la nueva', async () => {
        const sa = await loginAsSuperAdmin();
        const adminSession = await loginAsAdmin();
        const adminId = adminSession.user.id;

        // Cambio temporalmente la password del admin
        const newPass = 'temp-' + Date.now();
        const resetRes = await api.post(
            `/api/usuarios/${adminId}/reset-password`,
            { password: newPass },
            authHeaders(sa.token)
        );
        expect(resetRes.status).toBe(204);

        // Login con la nueva password debe funcionar
        const newLogin = await api.post('/api/auth/login', {
            email: 'admin@demo.com',
            password: newPass,
        });
        expect(newLogin.status).toBe(200);

        // Restauro la password original para no romper otros tests
        await api.post(
            `/api/usuarios/${adminId}/reset-password`,
            { password: 'admin123' },
            authHeaders(sa.token)
        );
    });

    test('reset password sin auth devuelve 401', async () => {
        const res = await api.post('/api/usuarios/2/reset-password', { password: 'x123456' });
        expect([401, 403]).toContain(res.status);
    });
});
