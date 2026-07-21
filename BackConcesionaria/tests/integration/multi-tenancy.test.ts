import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique, tryDelete } from './helpers';

describe('Multi-tenancy + RLS', () => {
    let saToken: string;
    let adminToken: string;
    let adminConcesionariaId: number;
    let tenantBId: number;
    let clienteBId: number;

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        const ad = await loginAsAdmin();
        saToken = sa.token;
        adminToken = ad.token;
        adminConcesionariaId = ad.user.concesionariaId!;

        // Crear segundo tenant + cliente como super_admin
        const tenantRes = await api.post(
            '/api/concesionarias',
            { nombre: unique('Tenant'), cuit: '20-' + Date.now() + '-9' },
            authHeaders(saToken)
        );
        expect(tenantRes.status).toBe(201);
        tenantBId = tenantRes.data.id;

        const clienteRes = await api.post(
            '/api/clientes',
            { nombre: unique('Cliente B'), concesionariaId: tenantBId },
            authHeaders(saToken)
        );
        expect(clienteRes.status).toBe(201);
        clienteBId = clienteRes.data.id;
    });

    afterAll(async () => {
        // Cleanup: borrar cliente y tenant. Soft-delete via RLS-aware extension.
        await tryDelete(`/api/clientes/${clienteBId}`, saToken);
        await tryDelete(`/api/concesionarias/${tenantBId}`, saToken);
    });

    test('admin del tenant 1 NO ve clientes del tenant 2', async () => {
        const res = await api.get('/api/clientes', authHeaders(adminToken));
        expect(res.status).toBe(200);
        const ids = res.data.results.map((c: any) => c.id);
        expect(ids).not.toContain(clienteBId);
    });

    test('admin del tenant 1 NO puede leer cliente del tenant 2 por id', async () => {
        const res = await api.get(`/api/clientes/${clienteBId}`, authHeaders(adminToken));
        // 404 porque RLS oculta la fila — el use-case dice "no encontrado"
        expect(res.status).toBe(404);
    });

    test('super_admin SÍ ve clientes de los dos tenants', async () => {
        const res = await api.get('/api/clientes', authHeaders(saToken));
        expect(res.status).toBe(200);
        const ids = res.data.results.map((c: any) => c.id);
        expect(ids).toContain(clienteBId);
    });

    test('admin no puede crear cliente en otro tenant aunque mande concesionariaId', async () => {
        // El extension de Prisma sobrescribe concesionariaId con el tenant del JWT.
        // El cliente quedará en el tenant del admin, no en B.
        const res = await api.post(
            '/api/clientes',
            { nombre: unique('Hack'), concesionariaId: tenantBId },
            authHeaders(adminToken)
        );
        expect(res.status).toBe(201);
        expect(res.data.concesionariaId).toBe(adminConcesionariaId);
        // Cleanup
        await tryDelete(`/api/clientes/${res.data.id}`, adminToken);
    });
});
