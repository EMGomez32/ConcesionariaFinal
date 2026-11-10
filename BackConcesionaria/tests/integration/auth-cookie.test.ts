import { api, loginAsAdmin, loginAsSuperAdmin, authHeaders, unique, tryDelete } from './helpers';
import { hotp, pasoDe } from '../../src/infrastructure/security/totp';

/**
 * Refresh token en cookie httpOnly `autenza_rt` (web). Login, 2FA, refresh y logout
 * la ponen / rotan / borran; refresh y logout toman el token de `body.refreshToken`
 * si viene (app móvil) y si no, de la cookie. Un refresh renovado con la COOKIE no
 * vuelve en el cuerpo (APP-11; el resto del contrato web está en sesion-web-absoluta).
 *
 * Cada test usa su propio usuario: la detección de reuso revoca TODAS las sesiones
 * del usuario y no tiene que alcanzar a los usuarios seed.
 */
describe('Refresh token en cookie httpOnly', () => {
    let saToken: string;
    let adminToken: string;
    const creados: number[] = [];
    const PASS = 'clave-cookie-123';
    const COOKIE = 'autenza_rt';

    beforeAll(async () => {
        saToken = (await loginAsSuperAdmin()).token;
        adminToken = (await loginAsAdmin()).token;
    });

    afterAll(async () => {
        for (const id of creados) await tryDelete(`/api/usuarios/${id}`, saToken);
    });

    async function nuevoUsuario() {
        const email = `${unique('ck')}@demo.com`;
        const r = await api.post('/api/usuarios', { nombre: unique('Ck'), email, password: PASS, roleIds: [] }, authHeaders(adminToken));
        expect(r.status).toBe(201);
        creados.push(r.data.id);
        return email;
    }

    /** La cabecera Set-Cookie de `autenza_rt` (o undefined). */
    const setCookie = (r: any): string | undefined =>
        ([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${COOKIE}=`));
    const valorDe = (cabecera: string) => decodeURIComponent(cabecera.split(';')[0].slice(COOKIE.length + 1));
    const conCookie = (token: string) => ({ headers: { Cookie: `otra=1; ${COOKIE}=${token}` } });

    const login = async (email: string) => {
        const r = await api.post('/api/auth/login', { email, password: PASS });
        expect(r.status).toBe(200);
        return r;
    };

    test('login pone la cookie con el refresh del cuerpo, httpOnly, SameSite=Strict y Path=/api/auth', async () => {
        const r = await login(await nuevoUsuario());
        // El cuerpo sigue igual: la app móvil lee los tokens de acá.
        expect(typeof r.data.tokens.access).toBe('string');
        expect(typeof r.data.tokens.refresh).toBe('string');
        expect(r.data.user.email).toBeDefined();

        const c = setCookie(r);
        expect(c).toBeDefined();
        expect(valorDe(c!)).toBe(r.data.tokens.refresh);
        expect(c).toMatch(/; HttpOnly/i);
        expect(c).toMatch(/; SameSite=Strict/i);
        expect(c).toMatch(/; Path=\/api\/auth(;|$)/);
        // Fuera de producción (los tests corren con NODE_ENV=test) no lleva Secure.
        expect(c).not.toMatch(/; Secure/i);
        // Vive lo que el refresh (JWT_REFRESH_EXPIRES_IN, 7d por defecto).
        const maxAge = Number(/Max-Age=(\d+)/i.exec(c!)?.[1]);
        expect(maxAge).toBeGreaterThan(60 * 60);
        expect(maxAge).toBeLessThanOrEqual(7 * 24 * 60 * 60);
    });

    test('refresh sin body usa la cookie, devuelve el access nuevo y rota la cookie (el refresh NO va en el cuerpo)', async () => {
        const inicio = await login(await nuevoUsuario());
        const vieja = valorDe(setCookie(inicio)!);

        const r = await api.post('/api/auth/refresh', undefined, conCookie(vieja));
        expect(r.status).toBe(200);
        expect(typeof r.data.access).toBe('string');
        // Renovó con la cookie (un navegador): el refresh rotado viaja sólo en la cookie,
        // aunque no venga la cabecera web. Si volviera en el JSON, un script inyectado se lo llevaría.
        expect(r.data).not.toHaveProperty('refresh');

        const rotada = setCookie(r);
        expect(rotada).toBeDefined();
        const nueva = valorDe(rotada!);
        expect(nueva).not.toBe(vieja);

        // La cookie rotada sigue renovando (también con un body vacío).
        const otra = await api.post('/api/auth/refresh', {}, conCookie(nueva));
        expect(otra.status).toBe(200);
        expect(otra.data).not.toHaveProperty('refresh');
        expect(valorDe(setCookie(otra)!)).not.toBe(nueva);
    });

    test('la detección de reuso sigue valiendo con la cookie', async () => {
        const inicio = await login(await nuevoUsuario());
        const vieja = valorDe(setCookie(inicio)!);
        const r = await api.post('/api/auth/refresh', undefined, conCookie(vieja));
        expect(r.status).toBe(200);
        const rotada = valorDe(setCookie(r)!);

        // Reingresar la cookie ya rotada = token robado: 401 y se cierran TODAS las sesiones.
        expect((await api.post('/api/auth/refresh', undefined, conCookie(vieja))).status).toBe(401);
        expect((await api.post('/api/auth/refresh', undefined, conCookie(rotada))).status).toBe(401);
    });

    test('refresh sin body ni cookie es 401', async () => {
        const r = await api.post('/api/auth/refresh');
        expect(r.status).toBe(401);
        expect(setCookie(r)).toBeUndefined();
    });

    test('refresh con body sigue funcionando y el body tiene prioridad sobre la cookie', async () => {
        const inicio = await login(await nuevoUsuario());
        const r = await api.post('/api/auth/refresh', { refreshToken: inicio.data.tokens.refresh }, conCookie('basura'));
        expect(r.status).toBe(200);
        expect(r.data.refresh).not.toBe(inicio.data.tokens.refresh);
        // También rota la cookie (inofensivo para la app, útil si la web todavía manda el body).
        expect(valorDe(setCookie(r)!)).toBe(r.data.refresh);
    });

    test('logout sin body revoca el refresh de la cookie y la borra', async () => {
        const inicio = await login(await nuevoUsuario());
        const token = valorDe(setCookie(inicio)!);

        const r = await api.post('/api/auth/logout', undefined, {
            headers: { Authorization: `Bearer ${inicio.data.tokens.access}`, Cookie: `${COOKIE}=${token}` },
        });
        expect(r.status).toBe(204);
        const borrada = setCookie(r);
        expect(borrada).toBeDefined();
        expect(valorDe(borrada!)).toBe('');
        expect(borrada).toMatch(/Expires=Thu, 01 Jan 1970/i);
        expect(borrada).toMatch(/; Path=\/api\/auth(;|$)/);

        expect((await api.post('/api/auth/refresh', undefined, conCookie(token))).status).toBe(401);
    });

    test('logout con body (app móvil) revoca ese token y también borra la cookie', async () => {
        const inicio = await login(await nuevoUsuario());
        const r = await api.post('/api/auth/logout', { refreshToken: inicio.data.tokens.refresh }, authHeaders(inicio.data.tokens.access));
        expect(r.status).toBe(204);
        expect(setCookie(r)).toBeDefined();
        expect((await api.post('/api/auth/refresh', { refreshToken: inicio.data.tokens.refresh })).status).toBe(401);
    });

    test('con 2FA: el primer paso no pone cookie; activar y verificar el código sí', async () => {
        const email = await nuevoUsuario();
        const inicio = await login(email);
        const access = inicio.data.tokens.access as string;

        const s = await api.post('/api/auth/2fa/setup', { password: PASS }, authHeaders(access));
        expect(s.status).toBe(200);
        const enable = await api.post('/api/auth/2fa/enable', { code: hotp(s.data.secreto, pasoDe(Date.now())) }, authHeaders(access));
        expect(enable.status).toBe(200);
        // Activar cierra la sesión anterior y emite otra: la cookie pasa a la nueva.
        expect(valorDe(setCookie(enable)!)).toBe(enable.data.tokens.refresh);

        const paso1 = await api.post('/api/auth/login', { email, password: PASS });
        expect(paso1.status).toBe(200);
        expect(paso1.data.requires2fa).toBe(true);
        expect(setCookie(paso1)).toBeUndefined();

        const paso2 = await api.post('/api/auth/login/2fa', {
            mfaToken: paso1.data.mfaToken, recoveryCode: enable.data.codigosRecuperacion[0],
        });
        expect(paso2.status).toBe(200);
        expect(valorDe(setCookie(paso2)!)).toBe(paso2.data.tokens.refresh);
        expect((await api.post('/api/auth/refresh', undefined, conCookie(paso2.data.tokens.refresh))).status).toBe(200);
    });
});
