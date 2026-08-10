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

    test('refresh con un token válido devuelve un par nuevo de tokens', async () => {
        const login = await api.post('/api/auth/login', {
            email: 'superadmin@demo.com',
            password: 'super123',
        });
        expect(login.status).toBe(200);

        const res = await api.post('/api/auth/refresh', { refreshToken: login.data.tokens.refresh });
        expect(res.status).toBe(200);
        expect(typeof res.data.access).toBe('string');
        expect(typeof res.data.refresh).toBe('string');
        // El refresh rota: el token nuevo es distinto del usado.
        expect(res.data.refresh).not.toBe(login.data.tokens.refresh);
        // Los roles del token nuevo salen de la DB (no del token viejo): el access
        // renovado debe seguir teniendo el rol correcto.
        const payload = JSON.parse(Buffer.from(res.data.access.split('.')[1], 'base64url').toString());
        expect(payload.roles).toContain('super_admin');
    });

    test('logout revoca el refresh token: ya no se puede refrescar con él', async () => {
        // Login directo para capturar el refresh token (el helper sólo expone el access).
        const login = await api.post('/api/auth/login', {
            email: 'superadmin@demo.com',
            password: 'super123',
        });
        expect(login.status).toBe(200);
        const refreshToken = login.data.tokens.refresh;

        // Logout enviando ese refresh token → 204 y queda revocado en el backend.
        const logoutRes = await api.post(
            '/api/auth/logout',
            { refreshToken },
            authHeaders(login.data.tokens.access)
        );
        expect(logoutRes.status).toBe(204);

        // Intentar renovar con el token revocado debe fallar (401).
        const refreshRes = await api.post('/api/auth/refresh', { refreshToken });
        expect(refreshRes.status).toBe(401);
    });

    test('logout sin body no falla (graceful, 204)', async () => {
        const login = await api.post('/api/auth/login', {
            email: 'superadmin@demo.com',
            password: 'super123',
        });
        const res = await api.post('/api/auth/logout', {}, authHeaders(login.data.tokens.access));
        expect(res.status).toBe(204);
    });

    test('logout de una sesión NO revoca las otras (no dispara detección de reuso)', async () => {
        // Dos sesiones del mismo usuario (dos "dispositivos").
        const a = await api.post('/api/auth/login', { email: 'superadmin@demo.com', password: 'super123' });
        const b = await api.post('/api/auth/login', { email: 'superadmin@demo.com', password: 'super123' });
        const rA = a.data.tokens.refresh;
        const rB = b.data.tokens.refresh;

        // Cierro la sesión A.
        const logoutRes = await api.post('/api/auth/logout', { refreshToken: rA }, authHeaders(a.data.tokens.access));
        expect(logoutRes.status).toBe(204);

        // Reingresar el token de A (ya cerrado) falla — pero como se BORRÓ (no se marcó
        // revocado), NO dispara revokeAllForUser, así que no arrastra las demás sesiones.
        const refreshA = await api.post('/api/auth/refresh', { refreshToken: rA });
        expect(refreshA.status).toBe(401);

        // La sesión B sigue viva: su refresh todavía renueva.
        const refreshB = await api.post('/api/auth/refresh', { refreshToken: rB });
        expect(refreshB.status).toBe(200);
    });
});
