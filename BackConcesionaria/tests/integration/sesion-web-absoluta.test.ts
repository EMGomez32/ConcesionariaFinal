import { Pool } from 'pg';
import { api, loginAsAdmin, loginAsSuperAdmin, authHeaders, unique, tryDelete } from './helpers';
import { hotp, pasoDe } from '../../src/infrastructure/security/totp';

/**
 * APP-11: el refresh no viaja en el cuerpo para la web y la sesión tiene vencimiento
 * absoluto.
 *
 *  - Con `X-Autenza-Cliente: web` login, segundo factor, activar el 2FA y refresh
 *    devuelven sólo el access; el refresh queda en la cookie httpOnly y con ella se renueva.
 *  - Sin la cabecera (app móvil: login → refresh con body.refreshToken) el contrato no cambia.
 *  - Pasados SESION_MAX_DIAS desde el login, el refresh da 401 SESION_MAXIMA_VENCIDA aunque
 *    la sesión se haya renovado (se envejece la sesión directo en la base del test).
 *  - Cambiar la contraseña desde la web conserva SU sesión (por el `sid` del access) y le
 *    rota la cookie; las demás se cierran.
 *
 * Cada test usa su propio usuario: la detección de reuso y los cierres de sesión son por
 * usuario y no tienen que alcanzar a los usuarios seed.
 */
const COOKIE = 'autenza_rt';
const WEB = { 'X-Autenza-Cliente': 'web' };
const PASS = 'clave-sesion-web-123';
const MAX_DIAS = Number(process.env.SESION_MAX_DIAS || 30);

const setCookie = (r: any): string | undefined =>
    ([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${COOKIE}=`));
const valorDe = (cabecera: string) => decodeURIComponent(cabecera.split(';')[0].slice(COOKIE.length + 1));
const cookieDe = (r: any) => {
    const c = setCookie(r);
    expect(c).toBeDefined();
    return valorDe(c!);
};
const conCookie = (token: string, extra: Record<string, string> = {}) => ({ headers: { Cookie: `${COOKIE}=${token}`, ...extra } });
const payloadDe = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));

describe('Sesión: refresh fuera del cuerpo para la web y vencimiento absoluto (APP-11)', () => {
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

    async function nuevoUsuario() {
        const email = `${unique('sw')}@demo.com`;
        const r = await api.post('/api/usuarios', { nombre: unique('Sw'), email, password: PASS, roleIds: [] }, authHeaders(adminToken));
        expect(r.status).toBe(201);
        creados.push(r.data.id);
        return { id: r.data.id as number, email };
    }

    const loginWeb = async (email: string, password = PASS) => {
        const r = await api.post('/api/auth/login', { email, password }, { headers: WEB });
        expect(r.status).toBe(200);
        return r;
    };
    const loginMovil = async (email: string, password = PASS) => {
        const r = await api.post('/api/auth/login', { email, password });
        expect(r.status).toBe(200);
        return r;
    };

    describe('web (X-Autenza-Cliente: web)', () => {
        test('login: el cuerpo trae sólo el access; el refresh va únicamente en la cookie', async () => {
            const u = await nuevoUsuario();
            const r = await loginWeb(u.email);
            expect(typeof r.data.tokens.access).toBe('string');
            expect(r.data.tokens).not.toHaveProperty('refresh');
            expect(r.data.user.email).toBe(u.email);
            expect(setCookie(r)).toMatch(/; HttpOnly/i);
            // El access nombra la sesión (sid): es lo que usa Ajustes para conservarla.
            expect(typeof payloadDe(r.data.tokens.access).sid).toBe('string');
        });

        test('refresh con la cookie: 200 con sólo el access, rota la cookie y la sesión sigue siendo la misma', async () => {
            const u = await nuevoUsuario();
            const l = await loginWeb(u.email);
            const sid = payloadDe(l.data.tokens.access).sid;
            const c1 = cookieDe(l);

            const r1 = await api.post('/api/auth/refresh', {}, conCookie(c1, WEB));
            expect(r1.status).toBe(200);
            expect(Object.keys(r1.data)).toEqual(['access']);
            expect(payloadDe(r1.data.access).sid).toBe(sid);
            const c2 = cookieDe(r1);
            expect(c2).not.toBe(c1);

            const r2 = await api.post('/api/auth/refresh', undefined, conCookie(c2, WEB));
            expect(r2.status).toBe(200);
            expect(r2.data).not.toHaveProperty('refresh');
            expect(payloadDe(r2.data.access).sid).toBe(sid);
        });

        test('aunque mande el refresh en el cuerpo (migración del storage viejo), no lo recibe de vuelta', async () => {
            const u = await nuevoUsuario();
            const movil = await loginMovil(u.email);
            const r = await api.post('/api/auth/refresh', { refreshToken: movil.data.tokens.refresh }, { headers: WEB });
            expect(r.status).toBe(200);
            expect(r.data).not.toHaveProperty('refresh');
            // Desde ahí sigue por cookie.
            expect((await api.post('/api/auth/refresh', {}, conCookie(cookieDe(r), WEB))).status).toBe(200);
        });

        test('2FA: activar y el segundo factor tampoco devuelven el refresh en el cuerpo; la cookie renueva', async () => {
            const u = await nuevoUsuario();
            const access = (await loginWeb(u.email)).data.tokens.access as string;
            const conWeb = { headers: { Authorization: `Bearer ${access}`, ...WEB } };

            const s = await api.post('/api/auth/2fa/setup', { password: PASS }, conWeb);
            expect(s.status).toBe(200);
            const enable = await api.post('/api/auth/2fa/enable', { code: hotp(s.data.secreto, pasoDe(Date.now())) }, conWeb);
            expect(enable.status).toBe(200);
            expect(enable.data.codigosRecuperacion.length).toBeGreaterThan(0);
            expect(typeof enable.data.tokens.access).toBe('string');
            expect(enable.data.tokens).not.toHaveProperty('refresh');
            expect((await api.post('/api/auth/refresh', {}, conCookie(cookieDe(enable), WEB))).status).toBe(200);

            const paso1 = await api.post('/api/auth/login', { email: u.email, password: PASS }, { headers: WEB });
            expect(paso1.status).toBe(200);
            expect(paso1.data.requires2fa).toBe(true);
            expect(setCookie(paso1)).toBeUndefined();

            const paso2 = await api.post('/api/auth/login/2fa', {
                mfaToken: paso1.data.mfaToken, recoveryCode: enable.data.codigosRecuperacion[0],
            }, { headers: WEB });
            expect(paso2.status).toBe(200);
            expect(typeof paso2.data.tokens.access).toBe('string');
            expect(paso2.data.tokens).not.toHaveProperty('refresh');
            expect(paso2.data.usoRecuperacion).toBe(true);
            expect((await api.post('/api/auth/refresh', {}, conCookie(cookieDe(paso2), WEB))).status).toBe(200);
        });

        test('cambiar MI contraseña desde la web conserva esta sesión (rota la cookie) y cierra las demás', async () => {
            const u = await nuevoUsuario();
            const web = await loginWeb(u.email);
            const sid = payloadDe(web.data.tokens.access).sid;
            const cookieVieja = cookieDe(web);
            const otra = await loginMovil(u.email);

            const r = await api.post(
                '/api/usuarios/me/password',
                { currentPassword: PASS, newPassword: 'otra-clave-segura-789' },
                { headers: { Authorization: `Bearer ${web.data.tokens.access}`, ...WEB } },
            );
            expect(r.status).toBe(204);
            const cookieNueva = cookieDe(r);
            expect(setCookie(r)).toMatch(/; Path=\/api\/auth(;|$)/);
            expect(cookieNueva).not.toBe(cookieVieja);

            // La otra sesión y el refresh viejo de la cookie quedaron cerrados...
            expect((await api.post('/api/auth/refresh', { refreshToken: otra.data.tokens.refresh })).status).toBe(401);
            expect((await api.post('/api/auth/refresh', {}, conCookie(cookieVieja, WEB))).status).toBe(401);
            // ...y la de este navegador sigue, en la MISMA sesión.
            const sigue = await api.post('/api/auth/refresh', {}, conCookie(cookieNueva, WEB));
            expect(sigue.status).toBe(200);
            expect(payloadDe(sigue.data.access).sid).toBe(sid);
        });

        test('cambiar sólo el nombre no toca la sesión ni la cookie', async () => {
            const u = await nuevoUsuario();
            const web = await loginWeb(u.email);
            const c = cookieDe(web);
            const r = await api.patch('/api/usuarios/me', { nombre: unique('Otro') }, { headers: { Authorization: `Bearer ${web.data.tokens.access}`, ...WEB } });
            expect(r.status).toBe(200);
            expect(setCookie(r)).toBeUndefined();
            expect((await api.post('/api/auth/refresh', {}, conCookie(c, WEB))).status).toBe(200);
        });

        test('cambiar el email desde la web también conserva esta sesión', async () => {
            const u = await nuevoUsuario();
            const web = await loginWeb(u.email);
            const r = await api.patch(
                '/api/usuarios/me',
                { email: `${unique('sw2')}@demo.com`, currentPassword: PASS },
                { headers: { Authorization: `Bearer ${web.data.tokens.access}`, ...WEB } },
            );
            expect(r.status).toBe(200);
            expect((await api.post('/api/auth/refresh', {}, conCookie(cookieDe(r), WEB))).status).toBe(200);
            expect((await api.post('/api/auth/refresh', {}, conCookie(cookieDe(web), WEB))).status).toBe(401);
        });
    });

    describe('app móvil (sin la cabecera): el contrato no cambia', () => {
        test('login → refresh con body.refreshToken → refresh otra vez con el rotado', async () => {
            const u = await nuevoUsuario();
            const l = await loginMovil(u.email);
            expect(typeof l.data.tokens.access).toBe('string');
            expect(typeof l.data.tokens.refresh).toBe('string');

            const r1 = await api.post('/api/auth/refresh', { refreshToken: l.data.tokens.refresh });
            expect(r1.status).toBe(200);
            expect(typeof r1.data.access).toBe('string');
            expect(typeof r1.data.refresh).toBe('string');
            expect(r1.data.refresh).not.toBe(l.data.tokens.refresh);

            const r2 = await api.post('/api/auth/refresh', { refreshToken: r1.data.refresh });
            expect(r2.status).toBe(200);
            expect(typeof r2.data.refresh).toBe('string');
        });

        test('cambiar la contraseña mandando body.refreshToken conserva esa sesión (camino de siempre, sin cookie)', async () => {
            const u = await nuevoUsuario();
            const actual = await loginMovil(u.email);
            const otra = await loginMovil(u.email);
            const r = await api.post(
                '/api/usuarios/me/password',
                { currentPassword: PASS, newPassword: 'otra-clave-segura-789', refreshToken: actual.data.tokens.refresh },
                authHeaders(actual.data.tokens.access),
            );
            expect(r.status).toBe(204);
            expect(setCookie(r)).toBeUndefined();
            expect((await api.post('/api/auth/refresh', { refreshToken: actual.data.tokens.refresh })).status).toBe(200);
            expect((await api.post('/api/auth/refresh', { refreshToken: otra.data.tokens.refresh })).status).toBe(401);
        });
    });

    // El vencimiento absoluto necesita envejecer la sesión: se hace con SQL sobre la base del
    // test (DATABASE_URL, la conexión de migraciones, igual que el test de retención).
    const DB_URL = process.env.DATABASE_URL;
    const describirConBase = DB_URL ? describe : describe.skip;

    describirConBase('vencimiento absoluto (SESION_MAX_DIAS desde el login)', () => {
        let pool: Pool;

        beforeAll(() => {
            pool = new Pool({ connectionString: DB_URL!.replace('prisma+postgres://', 'postgres://'), max: 2 });
        });
        afterAll(async () => { await pool.end(); });

        /** Corre el inicio de la sesión `dias` hacia atrás (todas sus filas). */
        const envejecer = (sid: string, dias: number) =>
            pool.query(`UPDATE refresh_tokens SET sesion_iniciada_at = sesion_iniciada_at - ($2::int * interval '1 day') WHERE familia = $1`, [sid, dias]);

        test('app móvil: pasado el máximo → 401 SESION_MAXIMA_VENCIDA; reintentar es un 401 genérico; otra sesión sigue', async () => {
            const u = await nuevoUsuario();
            const vieja = await loginMovil(u.email);
            const nueva = await loginMovil(u.email);
            // Se renovó (eso no corre el inicio)...
            const rot = await api.post('/api/auth/refresh', { refreshToken: vieja.data.tokens.refresh });
            expect(rot.status).toBe(200);
            // ...y el login fue hace más de SESION_MAX_DIAS.
            await envejecer(payloadDe(vieja.data.tokens.access).sid, MAX_DIAS + 1);

            const r = await api.post('/api/auth/refresh', { refreshToken: rot.data.refresh });
            expect(r.status).toBe(401);
            expect(r.data.error).toBe('SESION_MAXIMA_VENCIDA');
            expect(r.data.message).toMatch(/Volvé a iniciar sesión/);

            // La sesión cortada se borró: el mismo token ahora es un 401 a secas (sin otro evento).
            const otraVez = await api.post('/api/auth/refresh', { refreshToken: rot.data.refresh });
            expect(otraVez.status).toBe(401);
            expect(otraVez.data.error).toBe('UNAUTHORIZED');

            // Las demás sesiones del usuario no se tocan (no es un reuso).
            expect((await api.post('/api/auth/refresh', { refreshToken: nueva.data.tokens.refresh })).status).toBe(200);

            // Queda el rastro en security_events.
            const ev = await api.get('/api/security-events?accion=sesion_vencida&limit=500', authHeaders(saToken));
            expect(ev.status).toBe(200);
            const filas = (ev.data.results as Array<{ usuarioId: number | null }>).filter((e) => e.usuarioId === u.id);
            expect(filas).toHaveLength(1);
        });

        test('web: la cookie de una sesión pasada del máximo también da SESION_MAXIMA_VENCIDA', async () => {
            const u = await nuevoUsuario();
            const web = await loginWeb(u.email);
            await envejecer(payloadDe(web.data.tokens.access).sid, MAX_DIAS);
            const r = await api.post('/api/auth/refresh', {}, conCookie(cookieDe(web), WEB));
            expect(r.status).toBe(401);
            expect(r.data.error).toBe('SESION_MAXIMA_VENCIDA');
        });

        test('cerca del máximo todavía renueva, pero el refresh nuevo no vence después del tope', async () => {
            const u = await nuevoUsuario();
            const l = await loginMovil(u.email);
            const sid = payloadDe(l.data.tokens.access).sid;
            await envejecer(sid, MAX_DIAS - 2);

            const r = await api.post('/api/auth/refresh', { refreshToken: l.data.tokens.refresh });
            expect(r.status).toBe(200);
            const { rows } = await pool.query(
                `SELECT expires_at <= sesion_iniciada_at + ($2::int * interval '1 day') AS dentro_del_tope,
                        expires_at < now() AT TIME ZONE 'UTC' + interval '3 days' AS antes_del_deslizante
                   FROM refresh_tokens WHERE familia = $1 AND is_revoked = false`,
                [sid, MAX_DIAS],
            );
            expect(rows).toHaveLength(1);
            expect(rows[0].dentro_del_tope).toBe(true);
            expect(rows[0].antes_del_deslizante).toBe(true);
        });

        test('conservar la sesión al cambiar la contraseña NO reinicia el reloj absoluto', async () => {
            const u = await nuevoUsuario();
            const web = await loginWeb(u.email);
            const sid = payloadDe(web.data.tokens.access).sid;
            await envejecer(sid, 10);
            const antes = (await pool.query(`SELECT MIN(sesion_iniciada_at) AS i FROM refresh_tokens WHERE familia = $1`, [sid])).rows[0].i;

            const r = await api.post(
                '/api/usuarios/me/password',
                { currentPassword: PASS, newPassword: 'otra-clave-segura-789' },
                { headers: { Authorization: `Bearer ${web.data.tokens.access}`, ...WEB } },
            );
            expect(r.status).toBe(204);
            const { rows } = await pool.query(`SELECT sesion_iniciada_at AS i FROM refresh_tokens WHERE familia = $1 AND is_revoked = false`, [sid]);
            expect(rows).toHaveLength(1);
            expect(new Date(rows[0].i).getTime()).toBe(new Date(antes).getTime());
        });
    });
});
