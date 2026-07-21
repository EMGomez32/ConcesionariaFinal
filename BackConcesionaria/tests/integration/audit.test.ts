import { api, loginAsSuperAdmin, authHeaders, unique } from './helpers';

describe('Auditoría', () => {
    let token: string;
    let concesionariaId: number;

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        token = sa.token;
        concesionariaId = sa.user.concesionariaId!;
    });

    test('login dispara audit log con accion=login + ip + userAgent', async () => {
        // Hacer un login fresco para tener un audit log nuevo
        await api.post('/api/auth/login', {
            email: 'superadmin@demo.com',
            password: 'super123',
        });

        // El log más reciente con accion=login debe ser este
        const res = await api.get(
            '/api/auditoria?accion=login&limit=5',
            authHeaders(token)
        );
        expect(res.status).toBe(200);
        const logs = res.data.results;
        expect(logs.length).toBeGreaterThan(0);

        const last = logs[0];
        expect(last.accion).toBe('login');
        expect(last.entidad).toBe('Usuario');
        expect(last.ip).toBeTruthy();
        expect(last.userAgent).toBeTruthy();
    });

    test('crear y borrar proveedor dispara create + delete_soft en audit', async () => {
        const create = await api.post(
            '/api/proveedores',
            { nombre: unique('AuditTest'), tipo: 'taller', concesionariaId },
            authHeaders(token)
        );
        const provId = create.data.id;

        await api.delete(`/api/proveedores/${provId}`, authHeaders(token));

        // Buscar logs de Proveedor para esta entidadId
        const res = await api.get(
            `/api/auditoria?entidad=Proveedor&limit=20`,
            authHeaders(token)
        );
        const matching = res.data.results.filter((l: any) => l.entidadId === provId);
        const acciones = matching.map((l: any) => l.accion);
        expect(acciones).toEqual(expect.arrayContaining(['create', 'delete_soft']));
    });

    test('export CSV devuelve text/csv con BOM UTF-8', async () => {
        // arraybuffer para inspeccionar bytes crudos: axios string puede stripear BOM
        const res = await api.get('/api/auditoria/export', {
            ...authHeaders(token),
            responseType: 'arraybuffer',
        });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/);

        const buf = Buffer.from(res.data);
        // BOM UTF-8: EF BB BF
        expect(buf[0]).toBe(0xef);
        expect(buf[1]).toBe(0xbb);
        expect(buf[2]).toBe(0xbf);

        const text = buf.toString('utf8');
        expect(text).toMatch(/id,fecha,usuarioId,usuarioNombre,usuarioEmail,entidad,entidadId,accion,detalle,ip,userAgent/);
    });
});
