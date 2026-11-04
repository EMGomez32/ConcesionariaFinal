import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique, tryDelete } from './helpers';
import { hotp, pasoDe } from '../../src/infrastructure/security/totp';

/**
 * 2FA (TOTP): alta, login en dos pasos, códigos de recuperación, desactivación y reset por un admin.
 *
 * Los códigos se generan con el mismo módulo que usa el servidor. Un código TOTP sólo vale UNA vez (anti
 * replay) y exige un paso MAYOR al último usado; por eso cada usuario usa a lo sumo dos códigos: el del
 * paso actual para activar y el del SIGUIENTE (la ventana tolera ±1) para el login o la regeneración.
 * Todo lo demás va con códigos de recuperación.
 */
describe('2FA (TOTP)', () => {
    let saToken: string;
    let adminToken: string;
    const creados: number[] = [];
    const PASS = 'clave-segura-2fa-1';

    beforeAll(async () => {
        saToken = (await loginAsSuperAdmin()).token;
        adminToken = (await loginAsAdmin()).token;
    });

    afterAll(async () => {
        for (const id of creados) await tryDelete(`/api/usuarios/${id}`, saToken);
    });

    async function nuevoUsuario() {
        const email = `${unique('mfa')}@demo.com`;
        const r = await api.post('/api/usuarios', { nombre: unique('Mfa'), email, password: PASS, roleIds: [] }, authHeaders(adminToken));
        expect(r.status).toBe(201);
        creados.push(r.data.id);
        const login = await api.post('/api/auth/login', { email, password: PASS });
        expect(login.status).toBe(200);
        return { id: r.data.id as number, email, access: login.data.tokens.access as string, refresh: login.data.tokens.refresh as string };
    }

    /** Activa el 2FA y devuelve secreto + códigos de recuperación + la sesión nueva. */
    async function activar(u: { access: string }) {
        const s = await api.post('/api/auth/2fa/setup', { password: PASS }, authHeaders(u.access));
        expect(s.status).toBe(200);
        const secreto = s.data.secreto as string;
        const e = await api.post('/api/auth/2fa/enable', { code: hotp(secreto, pasoDe(Date.now())) }, authHeaders(u.access));
        expect({ status: e.status, data: e.data }).toMatchObject({ status: 200 });
        return { secreto, codigos: e.data.codigosRecuperacion as string[], sesion: e.data };
    }

    const loginPaso1 = (email: string) => api.post('/api/auth/login', { email, password: PASS });
    /** Código del paso SIGUIENTE (válido por la ventana ±1 y mayor al usado al activar). */
    const codigoSiguiente = (secreto: string) => hotp(secreto, pasoDe(Date.now()) + 1);

    test('una cuenta sin 2FA entra como siempre y el estado lo dice', async () => {
        const u = await nuevoUsuario();
        const st = await api.get('/api/auth/2fa/status', authHeaders(u.access));
        expect(st.status).toBe(200);
        expect(st.data).toMatchObject({ activo: false, codigosRestantes: 0 });
    });

    test('setup exige la contraseña actual y devuelve secreto + URI otpauth', async () => {
        const u = await nuevoUsuario();
        const mal = await api.post('/api/auth/2fa/setup', { password: 'incorrecta' }, authHeaders(u.access));
        expect(mal.status).toBe(400);
        expect(mal.data.error).toBe('INVALID_CURRENT_PASSWORD');

        const ok = await api.post('/api/auth/2fa/setup', { password: PASS }, authHeaders(u.access));
        expect(ok.status).toBe(200);
        expect(ok.data.secreto).toMatch(/^[A-Z2-7]{32}$/);
        expect(ok.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
        expect(decodeURIComponent(ok.data.otpauthUrl)).toContain(u.email);
    });

    test('enable con un código incorrecto no activa nada', async () => {
        const u = await nuevoUsuario();
        await api.post('/api/auth/2fa/setup', { password: PASS }, authHeaders(u.access));
        const r = await api.post('/api/auth/2fa/enable', { code: '000000' }, authHeaders(u.access));
        expect(r.status).toBe(400);
        expect(r.data.error).toBe('MFA_CODIGO_INVALIDO');
        expect((await api.get('/api/auth/2fa/status', authHeaders(u.access))).data.activo).toBe(false);
        // Y el login sigue siendo de un solo paso.
        expect((await loginPaso1(u.email)).data.tokens).toBeDefined();
    });

    test('activar devuelve 10 códigos de recuperación, una sesión nueva y cierra la anterior', async () => {
        const u = await nuevoUsuario();
        const { codigos, sesion } = await activar(u);
        expect(codigos).toHaveLength(10);
        for (const c of codigos) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
        expect(sesion.tokens.access).toBeTruthy();

        // La sesión de ANTES de activar (sin segundo factor) ya no renueva.
        expect((await api.post('/api/auth/refresh', { refreshToken: u.refresh })).status).toBe(401);
        // La nueva sí.
        expect((await api.post('/api/auth/refresh', { refreshToken: sesion.tokens.refresh })).status).toBe(200);

        const st = await api.get('/api/auth/2fa/status', authHeaders(sesion.tokens.access));
        expect(st.data).toMatchObject({ activo: true, codigosRestantes: 10 });
    });

    test('con 2FA activo el login NO da sesión: pide el segundo paso', async () => {
        const u = await nuevoUsuario();
        const { secreto } = await activar(u);

        const p1 = await loginPaso1(u.email);
        expect(p1.status).toBe(200);
        expect(p1.data.requires2fa).toBe(true);
        expect(typeof p1.data.mfaToken).toBe('string');
        expect(p1.data.tokens).toBeUndefined();
        expect(p1.data.user).toBeUndefined();

        const p2 = await api.post('/api/auth/login/2fa', { mfaToken: p1.data.mfaToken, code: codigoSiguiente(secreto) });
        expect({ status: p2.status, data: p2.data }).toMatchObject({ status: 200 });
        expect(p2.data.tokens.access).toBeTruthy();
        expect(p2.data.user).toMatchObject({ email: u.email, mfaActivo: true });

        // La sesión obtenida funciona.
        expect((await api.get('/api/auth/2fa/status', authHeaders(p2.data.tokens.access))).status).toBe(200);
    });

    test('código TOTP incorrecto → 401 genérico; el mismo código NO sirve dos veces (replay)', async () => {
        const u = await nuevoUsuario();
        const { secreto } = await activar(u);
        const p1 = await loginPaso1(u.email);

        const mal = await api.post('/api/auth/login/2fa', { mfaToken: p1.data.mfaToken, code: '000000' });
        expect(mal.status).toBe(401);

        const codigo = codigoSiguiente(secreto);
        expect((await api.post('/api/auth/login/2fa', { mfaToken: p1.data.mfaToken, code: codigo })).status).toBe(200);
        // Mismo código, mismo (o nuevo) mfaToken: ya está usado.
        const p1b = await loginPaso1(u.email);
        expect((await api.post('/api/auth/login/2fa', { mfaToken: p1b.data.mfaToken, code: codigo })).status).toBe(401);
    });

    test('un mfaToken inventado o de otro tipo → 401, y NO sirve como access token', async () => {
        const u = await nuevoUsuario();
        await activar(u);
        const p1 = await loginPaso1(u.email);

        expect((await api.post('/api/auth/login/2fa', { mfaToken: 'basura', code: '123456' })).status).toBe(401);
        expect((await api.post('/api/auth/login/2fa', { mfaToken: u.access, code: '123456' })).status).toBe(401);

        // El token de "contraseña correcta" no abre la API.
        const abre = await api.get('/api/ventas', authHeaders(p1.data.mfaToken));
        expect(abre.status).toBe(401);
    });

    test('código de recuperación: sirve UNA vez', async () => {
        const u = await nuevoUsuario();
        const { codigos } = await activar(u);

        const p1 = await loginPaso1(u.email);
        const r1 = await api.post('/api/auth/login/2fa', { mfaToken: p1.data.mfaToken, recoveryCode: codigos[0] });
        expect({ status: r1.status, data: r1.data }).toMatchObject({ status: 200 });
        expect(r1.data.usoRecuperacion).toBe(true);

        const p1b = await loginPaso1(u.email);
        expect((await api.post('/api/auth/login/2fa', { mfaToken: p1b.data.mfaToken, recoveryCode: codigos[0] })).status).toBe(401);
        // Otro código distinto sí.
        expect((await api.post('/api/auth/login/2fa', { mfaToken: p1b.data.mfaToken, recoveryCode: codigos[1] })).status).toBe(200);

        const st = await api.get('/api/auth/2fa/status', authHeaders(r1.data.tokens.access));
        expect(st.data.codigosRestantes).toBe(8);
    });

    test('el código de recuperación se acepta en minúsculas y sin guion', async () => {
        const u = await nuevoUsuario();
        const { codigos } = await activar(u);
        const p1 = await loginPaso1(u.email);
        const tipeado = codigos[2].toLowerCase().replace('-', ' ');
        expect((await api.post('/api/auth/login/2fa', { mfaToken: p1.data.mfaToken, recoveryCode: tipeado })).status).toBe(200);
    });

    test('pasar code Y recoveryCode juntos, o ninguno → 400', async () => {
        const u = await nuevoUsuario();
        await activar(u);
        const p1 = await loginPaso1(u.email);
        expect((await api.post('/api/auth/login/2fa', { mfaToken: p1.data.mfaToken })).status).toBe(400);
        expect((await api.post('/api/auth/login/2fa', { mfaToken: p1.data.mfaToken, code: '123456', recoveryCode: 'ABCDE-FGHJK' })).status).toBe(400);
    });

    test('regenerar códigos pide contraseña + código y deja sin efecto a los anteriores', async () => {
        const u = await nuevoUsuario();
        const { secreto, codigos, sesion } = await activar(u);
        const acceso = sesion.tokens.access;

        const sinPass = await api.post('/api/auth/2fa/recovery-codes', { password: 'mal', code: codigoSiguiente(secreto) }, authHeaders(acceso));
        expect(sinPass.status).toBe(400);

        const r = await api.post('/api/auth/2fa/recovery-codes', { password: PASS, code: codigoSiguiente(secreto) }, authHeaders(acceso));
        expect({ status: r.status, data: r.data }).toMatchObject({ status: 200 });
        expect(r.data.codigosRecuperacion).toHaveLength(10);

        const p1 = await loginPaso1(u.email);
        expect((await api.post('/api/auth/login/2fa', { mfaToken: p1.data.mfaToken, recoveryCode: codigos[0] })).status).toBe(401);
        expect((await api.post('/api/auth/login/2fa', { mfaToken: p1.data.mfaToken, recoveryCode: r.data.codigosRecuperacion[0] })).status).toBe(200);
    });

    test('desactivar pide contraseña + código; después el login vuelve a ser de un solo paso', async () => {
        const u = await nuevoUsuario();
        const { codigos, sesion } = await activar(u);
        const acceso = sesion.tokens.access;

        expect((await api.post('/api/auth/2fa/disable', { password: 'mal', recoveryCode: codigos[0] }, authHeaders(acceso))).status).toBe(400);
        expect((await api.post('/api/auth/2fa/disable', { password: PASS, recoveryCode: 'ZZZZZ-ZZZZZ' }, authHeaders(acceso))).status).toBe(400);

        const ok = await api.post('/api/auth/2fa/disable', { password: PASS, recoveryCode: codigos[0] }, authHeaders(acceso));
        expect(ok.status).toBe(204);

        const p = await loginPaso1(u.email);
        expect(p.data.tokens).toBeDefined();
        expect(p.data.requires2fa).toBeUndefined();
    });

    test('un admin resetea el 2FA de un usuario de su concesionaria: se apaga y se cierran sus sesiones', async () => {
        const u = await nuevoUsuario();
        const { sesion } = await activar(u);

        const r = await api.post(`/api/usuarios/${u.id}/2fa/reset`, {}, authHeaders(adminToken));
        expect(r.status).toBe(204);

        expect((await api.post('/api/auth/refresh', { refreshToken: sesion.tokens.refresh })).status).toBe(401);
        const p = await loginPaso1(u.email);
        expect(p.data.tokens).toBeDefined();
    });

    test('un usuario sin rol de admin NO puede resetear el 2FA de otro (403)', async () => {
        const a = await nuevoUsuario();
        const b = await nuevoUsuario();
        const r = await api.post(`/api/usuarios/${b.id}/2fa/reset`, {}, authHeaders(a.access));
        expect(r.status).toBe(403);
    });

    test('las respuestas de la API NUNCA traen el secreto del 2FA ni el hash de la contraseña', async () => {
        const u = await nuevoUsuario();
        await activar(u);
        for (const ruta of [`/api/usuarios/${u.id}`, '/api/usuarios?limit=50']) {
            const r = await api.get(ruta, authHeaders(adminToken));
            expect(r.status).toBe(200);
            const texto = JSON.stringify(r.data);
            expect(texto).not.toContain('totpSecret');
            expect(texto).not.toContain('totpLastStep');
            expect(texto).not.toContain('passwordHash');
        }
    });

    test('la política de contraseñas nuevas rechaza claves cortas y comunes al dar de alta', async () => {
        for (const password of ['corta', 'password123', '1234567890']) {
            const r = await api.post('/api/usuarios', { nombre: unique('P'), email: `${unique('p')}@demo.com`, password, roleIds: [] }, authHeaders(adminToken));
            expect(r.status).toBe(400);
        }
    });
});
