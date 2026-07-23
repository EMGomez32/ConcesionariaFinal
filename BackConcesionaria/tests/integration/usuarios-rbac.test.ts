import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * RBAC multi-tenant sobre /usuarios: el guard de reasignación de tenant.
 *
 * El hueco: UsuarioController.create ya forzaba el tenant del actor (un admin no
 * puede crear en otra concesionaria), pero update pasaba concesionariaId del body
 * tal cual. Un admin podía armar un PATCH manual con { concesionariaId: <otra> } y
 * mover al usuario a otro tenant. El fix strippea concesionariaId del body salvo
 * super_admin (que sí puede reasignar). El schema Zod deja pasar el campo a
 * propósito; el candado es del controller.
 */
describe('RBAC /usuarios — reasignación de tenant (update)', () => {
    let saToken: string;
    let adminToken: string;
    let adminConcesionariaId: number;
    let tenantBId: number;
    let userId: number;

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        const ad = await loginAsAdmin();
        saToken = sa.token;
        adminToken = ad.token;
        adminConcesionariaId = ad.user.concesionariaId!;

        // Segundo tenant (destino de un intento de fuga cross-tenant).
        const tenantRes = await api.post(
            '/api/concesionarias',
            { nombre: unique('TenantU'), cuit: '20-' + Date.now() + '-8' },
            authHeaders(saToken)
        );
        expect(tenantRes.status).toBe(201);
        tenantBId = tenantRes.data.id;

        // El admin crea un usuario EN SU PROPIO tenant (el controller inyecta su
        // concesionariaId; el body no la trae). Es el usuario que después intentará
        // mover de tenant.
        const userRes = await api.post(
            '/api/usuarios',
            { nombre: unique('U'), email: unique('u') + '@demo.com', password: 'secret123', roleIds: [] },
            authHeaders(adminToken)
        );
        expect(userRes.status).toBe(201);
        expect(userRes.data.concesionariaId).toBe(adminConcesionariaId);
        userId = userRes.data.id;
    });

    afterAll(async () => {
        // super_admin puede borrar el usuario esté en el tenant que esté.
        await tryDelete(`/api/usuarios/${userId}`, saToken);
        await tryDelete(`/api/concesionarias/${tenantBId}`, saToken);
    });

    test('admin común NO puede reasignar el tenant del usuario (concesionariaId se ignora)', async () => {
        const res = await api.patch(
            `/api/usuarios/${userId}`,
            { nombre: unique('U-editado'), concesionariaId: tenantBId },
            authHeaders(adminToken)
        );
        // 200: el update se aplica, pero concesionariaId fue strippeado. Sin el
        // guard esto sería un 500 (la RLS rebota el WITH CHECK) o, peor, movería la
        // fila. El usuario sigue en el tenant del admin.
        expect(res.status).toBe(200);
        expect(res.data.concesionariaId).toBe(adminConcesionariaId);
    });

    test('el usuario sigue siendo visible para el admin (no se fue del tenant)', async () => {
        const res = await api.get(`/api/usuarios/${userId}`, authHeaders(adminToken));
        expect(res.status).toBe(200);
        expect(res.data.concesionariaId).toBe(adminConcesionariaId);
    });

    test('super_admin SÍ puede reasignar el tenant del usuario', async () => {
        const res = await api.patch(
            `/api/usuarios/${userId}`,
            { concesionariaId: tenantBId },
            authHeaders(saToken)
        );
        expect(res.status).toBe(200);
        expect(res.data.concesionariaId).toBe(tenantBId);
    });

    test('tras la reasignación, el admin del tenant original ya NO ve al usuario', async () => {
        const res = await api.get(`/api/usuarios/${userId}`, authHeaders(adminToken));
        // 404: la RLS oculta la fila que ahora vive en el tenant B.
        expect(res.status).toBe(404);
    });
});
