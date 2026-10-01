import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * Sesiones y credenciales (auditoría de seguridad, H3):
 *  - cambiar/resetear la contraseña cierra las sesiones (refresh tokens);
 *  - cambiar el email propio exige la contraseña actual;
 *  - el refresh es atómico (un solo ganador por token).
 * Cada test crea su propio usuario para no tocar los usuarios seed.
 */
describe('Sesiones y credenciales', () => {
    let saToken: string;
    let adminToken: string;
    const creados: number[] = [];

    beforeAll(async () => {
        saToken = (await loginAsSuperAdmin()).token;
        adminToken = (await loginAsAdmin()).token;
    });

    afterAll(async () => {
        for (const id of creados) await tryDelete(`/api/usuarios/${id}`, saToken);
    });

    const PASS = 'secret12345';

    async function nuevoUsuario() {
        const email = `${unique('ses')}@demo.com`;
        const r = await api.post(
            '/api/usuarios',
            { nombre: unique('Ses'), email, password: PASS, roleIds: [] },
            authHeaders(adminToken),
        );
        expect(r.status).toBe(201);
        creados.push(r.data.id);
        return { id: r.data.id as number, email };
    }

    async function loginUser(email: string, password = PASS) {
        const r = await api.post('/api/auth/login', { email, password });
        expect(r.status).toBe(200);
        return { access: r.data.tokens.access as string, refresh: r.data.tokens.refresh as string };
    }

    const refresh = (token: string) => api.post('/api/auth/refresh', { refreshToken: token });

    test('el reset de contraseña por un admin cierra las sesiones abiertas', async () => {
        const u = await nuevoUsuario();
        const s = await loginUser(u.email);

        const r = await api.post(`/api/usuarios/${u.id}/reset-password`, { password: 'nueva12345' }, authHeaders(adminToken));
        expect(r.status).toBe(204);

        expect((await refresh(s.refresh)).status).toBe(401);
    });

    test('tras el reset, reingresar el refresh viejo NO mata la sesión nueva', async () => {
        const u = await nuevoUsuario();
        const vieja = await loginUser(u.email);

        await api.post(`/api/usuarios/${u.id}/reset-password`, { password: 'nueva12345' }, authHeaders(adminToken));
        const nueva = await loginUser(u.email, 'nueva12345');

        // Un atacante reintenta con el token robado: 401 a secas...
        expect((await refresh(vieja.refresh)).status).toBe(401);
        // ...y la sesión legítima nueva sigue viva (antes la detección de reuso la mataba).
        expect((await refresh(nueva.refresh)).status).toBe(200);
    });

    test('cambiar MI contraseña conservando mi refresh: cierra las otras sesiones, no la actual', async () => {
        const u = await nuevoUsuario();
        const actual = await loginUser(u.email);
        const otra = await loginUser(u.email);

        const r = await api.post(
            '/api/usuarios/me/password',
            { currentPassword: PASS, newPassword: 'nueva12345', refreshToken: actual.refresh },
            authHeaders(actual.access),
        );
        expect(r.status).toBe(204);

        expect((await refresh(otra.refresh)).status).toBe(401);
        expect((await refresh(actual.refresh)).status).toBe(200);
    });

    test('cambiar mi contraseña SIN mandar refresh cierra todas las sesiones', async () => {
        const u = await nuevoUsuario();
        const s = await loginUser(u.email);

        const r = await api.post(
            '/api/usuarios/me/password',
            { currentPassword: PASS, newPassword: 'nueva12345' },
            authHeaders(s.access),
        );
        expect(r.status).toBe(204);
        expect((await refresh(s.refresh)).status).toBe(401);
    });

    test('con la contraseña actual incorrecta no cambia nada ni cierra sesiones', async () => {
        const u = await nuevoUsuario();
        const s = await loginUser(u.email);

        const r = await api.post(
            '/api/usuarios/me/password',
            { currentPassword: 'incorrecta', newPassword: 'nueva12345' },
            authHeaders(s.access),
        );
        expect(r.status).toBe(400);
        expect((await refresh(s.refresh)).status).toBe(200);
    });

    describe('PATCH /usuarios/me: cambiar el email exige la contraseña actual', () => {
        test('reenviar el mismo email (como el formulario) y cambiar el nombre no la pide', async () => {
            const u = await nuevoUsuario();
            const s = await loginUser(u.email);

            const r = await api.patch('/api/usuarios/me', { nombre: unique('Otro'), email: u.email }, authHeaders(s.access));
            expect(r.status).toBe(200);
            expect((await refresh(s.refresh)).status).toBe(200);
        });

        test('cambiar el email sin contraseña actual da 400 CURRENT_PASSWORD_REQUIRED', async () => {
            const u = await nuevoUsuario();
            const s = await loginUser(u.email);

            const r = await api.patch('/api/usuarios/me', { email: `${unique('nuevo')}@demo.com` }, authHeaders(s.access));
            expect(r.status).toBe(400);
            expect(r.data.error).toBe('CURRENT_PASSWORD_REQUIRED');
        });

        test('cambiar el email con contraseña incorrecta da 400 y el email NO cambia', async () => {
            const u = await nuevoUsuario();
            const s = await loginUser(u.email);

            const r = await api.patch(
                '/api/usuarios/me',
                { email: `${unique('nuevo')}@demo.com`, currentPassword: 'incorrecta' },
                authHeaders(s.access),
            );
            expect(r.status).toBe(400);
            expect(r.data.error).toBe('INVALID_CURRENT_PASSWORD');
            // Sigue pudiendo entrar con el email original.
            await loginUser(u.email);
        });

        test('con la contraseña correcta cambia el email y cierra las OTRAS sesiones', async () => {
            const u = await nuevoUsuario();
            const actual = await loginUser(u.email);
            const otra = await loginUser(u.email);
            const nuevoEmail = `${unique('nuevo')}@demo.com`;

            const r = await api.patch(
                '/api/usuarios/me',
                { email: nuevoEmail, currentPassword: PASS, refreshToken: actual.refresh },
                authHeaders(actual.access),
            );
            expect(r.status).toBe(200);
            expect(r.data.email).toBe(nuevoEmail);

            expect((await refresh(otra.refresh)).status).toBe(401);
            expect((await refresh(actual.refresh)).status).toBe(200);
            await loginUser(nuevoEmail);
        });
    });

    test('desactivar a un usuario (admin) cierra sus sesiones', async () => {
        const u = await nuevoUsuario();
        const s = await loginUser(u.email);

        const r = await api.patch(`/api/usuarios/${u.id}`, { activo: false }, authHeaders(adminToken));
        expect(r.status).toBe(200);
        expect((await refresh(s.refresh)).status).toBe(401);
    });

    test('refresh CONCURRENTE con el mismo token: solo una request lo rota', async () => {
        const u = await nuevoUsuario();
        const s = await loginUser(u.email);

        const [a, b] = await Promise.all([refresh(s.refresh), refresh(s.refresh)]);
        expect([a.status, b.status].sort()).toEqual([200, 401]);
    });
});
