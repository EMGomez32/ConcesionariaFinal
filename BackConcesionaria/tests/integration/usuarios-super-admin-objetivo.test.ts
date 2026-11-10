import { Pool } from 'pg';
import { api, loginAsAdmin, loginAsSuperAdmin, login, authHeaders, unique, tryDelete } from './helpers';

const ADMIN_PASS = 'admin123';
const SUPER_PASS = 'super123';

// Conexión de migraciones (superusuario), la misma que usa retencion.test.ts: hace falta
// para fabricar una cuenta VIEJA mal configurada, que hoy ni la API ni la base dejan crear.
const DB_URL = process.env.DATABASE_URL;
const describirConBase = DB_URL ? describe : describe.skip;
const conexion = () => new Pool({ connectionString: DB_URL!.replace('prisma+postgres://', 'postgres://'), max: 1 });

const idsDeRoles = async (token: string) => {
    const roles = await api.get('/api/roles', authHeaders(token));
    const lista: any[] = roles.data.results ?? roles.data;
    return {
        superAdmin: lista.find((r) => r.nombre === 'super_admin').id as number,
        vendedor: lista.find((r) => r.nombre === 'vendedor').id as number,
    };
};

/**
 * APP-02: la cuenta de un super_admin sólo la administra otro super_admin. Un admin de
 * tenant que la ve (porque está asociada a su concesionaria) no puede cambiarle el email,
 * resetearle la contraseña o el 2FA, quitarle roles, desactivarla ni borrarla.
 *
 * Desde la migración super_admin_sin_concesionaria un super_admin ya no puede tener
 * concesionaria, pero en una base vieja puede haber quedado alguna: esa es la víctima.
 * Se fabrica creando un vendedor por la API y agregándole el rol super_admin por SQL con
 * los triggers apagados (session_replication_role = replica, sólo superusuario). Se ataca a
 * una cuenta CREADA por el test (no al super_admin del seed).
 */
describirConBase('Un admin de tenant no puede gestionar a un super_admin', () => {
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
        const roles = await idsDeRoles(saTok);
        rolVendedorId = roles.vendedor;

        victimaEmail = `${unique('plataforma')}@demo.com`;
        const alta = await api.post('/api/usuarios', {
            nombre: unique('SuperVictima'), email: victimaEmail, password: VICTIMA_PASS,
            roleIds: [roles.vendedor], concesionariaId: ad.user.concesionariaId,
        }, authHeaders(saTok));
        expect(alta.status).toBe(201);
        victimaId = alta.data.id;

        const pool = conexion();
        const cli = await pool.connect();
        try {
            await cli.query('BEGIN');
            await cli.query('SET LOCAL session_replication_role = replica');
            await cli.query(
                'INSERT INTO usuario_roles (usuario_id, rol_id, created_at, updated_at) VALUES ($1, $2, now(), now())',
                [victimaId, roles.superAdmin],
            );
            await cli.query('COMMIT');
        } finally {
            cli.release();
            await pool.end();
        }
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

/**
 * APP-02: un super_admin es una cuenta de PLATAFORMA. Ni la API ni la base dejan que
 * pertenezca a una concesionaria.
 */
describe('Un super_admin no puede pertenecer a una concesionaria', () => {
    let saTok: string;
    let tenantId: number;
    let roles: { superAdmin: number; vendedor: number };
    const creados: number[] = [];

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        saTok = sa.token;
        tenantId = (await loginAsAdmin()).user.concesionariaId;
        roles = await idsDeRoles(saTok);
    });

    afterAll(async () => { for (const id of creados) await tryDelete(`/api/usuarios/${id}`, saTok); });

    test('el super_admin del seed es de plataforma: no tiene concesionaria', async () => {
        const sa = await loginAsSuperAdmin();
        expect(sa.user.roles).toContain('super_admin');
        expect(sa.user.concesionariaId ?? null).toBeNull();
    });

    test('dar de alta un super_admin en una concesionaria → 400 SUPER_ADMIN_CON_CONCESIONARIA', async () => {
        const r = await api.post('/api/usuarios', {
            nombre: unique('SuperConTenant'), email: `${unique('sct')}@demo.com`, password: 'una-clave-larga-123',
            roleIds: [roles.superAdmin], concesionariaId: tenantId,
        }, authHeaders(saTok));
        expect({ status: r.status, error: r.data?.error }).toEqual({ status: 400, error: 'SUPER_ADMIN_CON_CONCESIONARIA' });
    });

    test('promover a super_admin a un usuario de una concesionaria → 400 y conserva su rol', async () => {
        const alta = await api.post('/api/usuarios', {
            nombre: unique('VendedorAPromover'), email: `${unique('vap')}@demo.com`, password: 'una-clave-larga-123',
            roleIds: [roles.vendedor], concesionariaId: tenantId,
        }, authHeaders(saTok));
        expect(alta.status).toBe(201);
        creados.push(alta.data.id);

        const r = await api.patch(`/api/usuarios/${alta.data.id}`, { roleIds: [roles.vendedor, roles.superAdmin] }, authHeaders(saTok));
        expect({ status: r.status, error: r.data?.error }).toEqual({ status: 400, error: 'SUPER_ADMIN_CON_CONCESIONARIA' });

        const despues = await api.get(`/api/usuarios/${alta.data.id}`, authHeaders(saTok));
        const nombres = (despues.data.roles ?? []).map((x: any) => x?.rol?.nombre ?? x?.nombre ?? x);
        expect(nombres).not.toContain('super_admin');
    });

    (DB_URL ? test : test.skip)('la base también lo impide (trigger), aunque se escriba por fuera de la API', async () => {
        const alta = await api.post('/api/usuarios', {
            nombre: unique('VendedorSql'), email: `${unique('vsq')}@demo.com`, password: 'una-clave-larga-123',
            roleIds: [roles.vendedor], concesionariaId: tenantId,
        }, authHeaders(saTok));
        expect(alta.status).toBe(201);
        creados.push(alta.data.id);

        const pool = conexion();
        try {
            await expect(pool.query(
                'INSERT INTO usuario_roles (usuario_id, rol_id, created_at, updated_at) VALUES ($1, $2, now(), now())',
                [alta.data.id, roles.superAdmin],
            )).rejects.toMatchObject({ code: '23514' });
        } finally {
            await pool.end();
        }
    });
});
