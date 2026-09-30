import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * Rastro de seguridad (auditoría, H5):
 *  - login fallido contra una cuenta que existe → audit_log de su concesionaria;
 *  - login fallido contra un email que NO existe → security_events (sólo super_admin);
 *  - la respuesta HTTP no revela el motivo;
 *  - pedido de recuperación de contraseña → audit_log;
 *  - los cambios de roles dejan el antes/después;
 *  - security_events sólo lo lee super_admin.
 * Los eventos de login/recuperación se escriben DESPUÉS de responder (res.on('finish')):
 * los tests reintentan hasta que aparecen.
 */
describe('Auditoría de seguridad', () => {
    let saToken: string;
    let adminToken: string;
    let adminId: number;

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        const ad = await loginAsAdmin();
        saToken = sa.token;
        adminToken = ad.token;
        adminId = ad.user.id;
    });

    /** Reintenta `fn` hasta que devuelve algo truthy (el evento se escribe async). */
    async function esperar<T>(fn: () => Promise<T | null | undefined | false>, intentos = 20): Promise<T> {
        for (let i = 0; i < intentos; i++) {
            const r = await fn();
            if (r) return r as T;
            await new Promise((res) => setTimeout(res, 150));
        }
        throw new Error('el evento de auditoría no apareció a tiempo');
    }

    test('login fallido contra una cuenta existente queda en audit_log y la respuesta no dice el motivo', async () => {
        const r = await api.post('/api/auth/login', { email: 'admin@demo.com', password: 'clave-incorrecta' });
        expect(r.status).toBe(401);
        expect(JSON.stringify(r.data)).not.toMatch(/inexistente|incorrecta|no existe/i);

        const fila = await esperar(async () => {
            const res = await api.get(`/api/auditoria?accion=login_fail&usuarioId=${adminId}&limit=5`, authHeaders(adminToken));
            return res.status === 200 ? res.data.results[0] : null;
        });
        expect(fila.accion).toBe('login_fail');
        expect(fila.usuarioId).toBe(adminId);
        expect(fila.detalle).toContain('contraseña incorrecta');
        expect(fila.ip).toBeTruthy();
    });

    test('la respuesta de un login fallido es idéntica exista o no el email', async () => {
        const existe = await api.post('/api/auth/login', { email: 'admin@demo.com', password: 'mal' });
        const noExiste = await api.post('/api/auth/login', { email: `${unique('nadie')}@demo.com`, password: 'mal' });
        expect(existe.status).toBe(noExiste.status);
        // El correlationId es distinto en cada request; el resto tiene que ser igual.
        const sinCorrelacion = (d: any) => ({ ...d, correlationId: undefined });
        expect(sinCorrelacion(existe.data)).toEqual(sinCorrelacion(noExiste.data));
    });

    test('login contra un email inexistente queda en security_events (sin guardar el email) y lo ve super_admin', async () => {
        const email = `${unique('fantasma')}@demo.com`;
        await api.post('/api/auth/login', { email, password: 'mal' });

        const fila = await esperar(async () => {
            const res = await api.get('/api/security-events?accion=login_fail&limit=20', authHeaders(saToken));
            expect(res.status).toBe(200);
            return res.data.results.find((e: any) => e.detalle?.includes('usuario inexistente'));
        });
        expect(fila.emailHash).toBeTruthy();
        expect(JSON.stringify(fila)).not.toContain(email);
    });

    test('un admin de tenant NO puede leer security_events (403)', async () => {
        const r = await api.get('/api/security-events', authHeaders(adminToken));
        expect(r.status).toBe(403);
    });

    test('sin sesión no se lee security_events', async () => {
        const r = await api.get('/api/security-events');
        expect([401, 403]).toContain(r.status);
    });

    test('pedir recuperación de contraseña de una cuenta existente queda en audit_log', async () => {
        const r = await api.post('/api/auth/forgot-password', { email: 'admin@demo.com' });
        expect(r.status).toBe(200);

        const fila = await esperar(async () => {
            const res = await api.get(`/api/auditoria?accion=password_reset_request&usuarioId=${adminId}&limit=5`, authHeaders(adminToken));
            return res.status === 200 ? res.data.results[0] : null;
        });
        expect(fila.accion).toBe('password_reset_request');
    });

    describe('cambios de roles', () => {
        const ids: number[] = [];
        afterAll(async () => { for (const id of ids) await tryDelete(`/api/usuarios/${id}`, saToken); });

        test('cambiar los roles de un usuario deja el antes → después en el detalle', async () => {
            const roles = await api.get('/api/roles', authHeaders(adminToken));
            expect(roles.status).toBe(200);
            const rol = (roles.data as Array<{ id: number; nombre: string }>)[0];
            expect(rol).toBeDefined();

            const u = await api.post(
                '/api/usuarios',
                { nombre: unique('Rol'), email: `${unique('rol')}@demo.com`, password: 'secret123', roleIds: [] },
                authHeaders(adminToken),
            );
            expect(u.status).toBe(201);
            ids.push(u.data.id);

            const p = await api.patch(`/api/usuarios/${u.data.id}`, { roleIds: [rol.id] }, authHeaders(adminToken));
            expect(p.status).toBe(200);

            const res = await api.get(`/api/auditoria?entidad=Usuario&accion=update&limit=50`, authHeaders(adminToken));
            const fila = res.data.results.find((e: any) => e.entidadId === u.data.id);
            expect(fila).toBeDefined();
            expect(fila.detalle).toContain('Roles: [sin roles]');
            expect(fila.detalle).toContain(rol.nombre);
        });
    });
});
