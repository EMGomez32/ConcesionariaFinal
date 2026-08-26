import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * Cross-tenant FK en usuarios: el RLS (tenant_iso) sólo valida el
 * concesionaria_id de la fila, NO que sucursalId apunte a una sucursal del
 * mismo tenant. Sin el chequeo de CreateUsuario/UpdateUsuario, un admin podía
 * craftear un POST/PATCH con el id de una sucursal ajena y el write pasaba.
 * Estos tests fijan el contrato: sucursal ajena => 404 (RLS la oculta para el
 * admin) o 400 (super_admin con tenant explícito que no coincide).
 */
describe('Usuarios — sucursalId debe ser del mismo tenant', () => {
    let saToken: string;
    let adminToken: string;
    let adminConcesionariaId: number;
    let tenantBId: number;
    let sucursalAId: number; // sucursal del tenant del admin
    let sucursalBId: number; // sucursal del tenant B (ajena al admin)
    let usuarioAId: number;  // usuario creado por el admin en su tenant

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        const ad = await loginAsAdmin();
        saToken = sa.token;
        adminToken = ad.token;
        adminConcesionariaId = ad.user.concesionariaId!;

        // Tenant B + sucursal B (como super_admin)
        const tenantRes = await api.post(
            '/api/concesionarias',
            { nombre: unique('TenantSuc'), cuit: '20-' + Date.now() + '-7' },
            authHeaders(saToken)
        );
        expect(tenantRes.status).toBe(201);
        tenantBId = tenantRes.data.id;

        const sucBRes = await api.post(
            '/api/sucursales',
            { nombre: unique('Sucursal B'), concesionariaId: tenantBId },
            authHeaders(saToken)
        );
        expect(sucBRes.status).toBe(201);
        sucursalBId = sucBRes.data.id;

        // Sucursal A en el tenant del admin (el controller ignora el body y
        // usa el tenant del token)
        const sucARes = await api.post(
            '/api/sucursales',
            { nombre: unique('Sucursal A') },
            authHeaders(adminToken)
        );
        expect(sucARes.status).toBe(201);
        sucursalAId = sucARes.data.id;
    });

    afterAll(async () => {
        if (usuarioAId) await tryDelete(`/api/usuarios/${usuarioAId}`, adminToken);
        if (sucursalAId) await tryDelete(`/api/sucursales/${sucursalAId}`, adminToken);
        if (sucursalBId) await tryDelete(`/api/sucursales/${sucursalBId}`, saToken);
        if (tenantBId) await tryDelete(`/api/concesionarias/${tenantBId}`, saToken);
    });

    test('admin NO puede crear usuario apuntando a una sucursal de otro tenant', async () => {
        const res = await api.post(
            '/api/usuarios',
            {
                nombre: unique('Hack'),
                email: `${unique('hack')}@test.com`,
                password: 'secreto123',
                sucursalId: sucursalBId,
                roleIds: [],
            },
            authHeaders(adminToken)
        );
        // Para el admin la sucursal ajena es invisible (RLS) => "no encontrada"
        expect(res.status).toBe(404);
    });

    test('admin SÍ puede crear usuario con una sucursal de su propio tenant', async () => {
        const res = await api.post(
            '/api/usuarios',
            {
                nombre: unique('Legit'),
                email: `${unique('legit')}@test.com`,
                password: 'secreto123',
                sucursalId: sucursalAId,
                roleIds: [],
            },
            authHeaders(adminToken)
        );
        expect(res.status).toBe(201);
        expect(res.data.sucursalId).toBe(sucursalAId);
        expect(res.data.concesionariaId).toBe(adminConcesionariaId);
        usuarioAId = res.data.id;
    });

    test('admin NO puede re-apuntar un usuario propio a una sucursal ajena', async () => {
        const res = await api.patch(
            `/api/usuarios/${usuarioAId}`,
            { sucursalId: sucursalBId },
            authHeaders(adminToken)
        );
        expect(res.status).toBe(404);

        // El usuario sigue apuntando a su sucursal original
        const check = await api.get(`/api/usuarios/${usuarioAId}`, authHeaders(adminToken));
        expect(check.status).toBe(200);
        expect(check.data.sucursalId).toBe(sucursalAId);
    });

    test('admin SÍ puede re-apuntar un usuario a otra sucursal propia', async () => {
        const res = await api.patch(
            `/api/usuarios/${usuarioAId}`,
            { sucursalId: sucursalAId },
            authHeaders(adminToken)
        );
        expect(res.status).toBe(200);
        expect(res.data.sucursalId).toBe(sucursalAId);
    });

    test('super_admin: sucursal que no es del tenant destino => 400', async () => {
        // Usuario en tenant B pero con sucursal del tenant A: incoherente.
        // super_admin ve ambas sucursales, así que acá el error es 400 explícito.
        const res = await api.post(
            '/api/usuarios',
            {
                nombre: unique('Cruzado'),
                email: `${unique('cruzado')}@test.com`,
                password: 'secreto123',
                concesionariaId: tenantBId,
                sucursalId: sucursalAId,
                roleIds: [],
            },
            authHeaders(saToken)
        );
        expect(res.status).toBe(400);
    });

    test('super_admin: sucursal coherente con el tenant destino => 201', async () => {
        const res = await api.post(
            '/api/usuarios',
            {
                nombre: unique('CoherenteB'),
                email: `${unique('coherente')}@test.com`,
                password: 'secreto123',
                concesionariaId: tenantBId,
                sucursalId: sucursalBId,
                roleIds: [],
            },
            authHeaders(saToken)
        );
        expect(res.status).toBe(201);
        expect(res.data.concesionariaId).toBe(tenantBId);
        expect(res.data.sucursalId).toBe(sucursalBId);
        // Cleanup inmediato: el tenant B se borra en afterAll
        await tryDelete(`/api/usuarios/${res.data.id}`, saToken);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MOVER UN USUARIO DE TENANT — sólo super_admin.
    //
    // Los tests de arriba prueban el caso estático: el tenant del usuario no
    // cambia y la sucursal tiene que ser de ESE tenant. Acá el tenant SÍ cambia,
    // y con él cambia contra qué hay que validar la sucursal.
    //
    // Es exclusivo de super_admin porque el controller borra `concesionariaId`
    // del body para cualquier otro rol. Si la sucursal se valida contra el tenant
    // ACTUAL en vez del DESTINO, el guard queda invertido: rechaza el movimiento
    // coherente y acepta el que deja la FK cruzada.
    // ──────────────────────────────────────────────────────────────────────────
    describe('super_admin mueve un usuario de una concesionaria a otra', () => {
        let usuarioMoverId: number;

        beforeAll(async () => {
            const res = await api.post(
                '/api/usuarios',
                {
                    nombre: unique('Mudanza'),
                    email: `${unique('mudanza')}@test.com`,
                    password: 'secreto123',
                    concesionariaId: adminConcesionariaId,
                    sucursalId: sucursalAId,
                    roleIds: [],
                },
                authHeaders(saToken)
            );
            expect(res.status).toBe(201);
            usuarioMoverId = res.data.id;
        });

        afterAll(async () => {
            // Antes que el afterAll de afuera, que borra el tenant B.
            if (usuarioMoverId) await tryDelete(`/api/usuarios/${usuarioMoverId}`, saToken);
        });

        test('mover a otro tenant CON la sucursal vieja => 400', async () => {
            // El caso que importó abrir todo esto: validando contra el tenant
            // ACTUAL, sucursalA coincide con el tenant actual y el PATCH pasaba,
            // dejando al usuario en el tenant B apuntando a una sucursal del A.
            const res = await api.patch(
                `/api/usuarios/${usuarioMoverId}`,
                { concesionariaId: tenantBId, sucursalId: sucursalAId },
                authHeaders(saToken)
            );
            expect(res.status).toBe(400);

            // Y no quedó escrito a medias: sigue entero en su tenant original.
            const check = await api.get(`/api/usuarios/${usuarioMoverId}`, authHeaders(saToken));
            expect(check.data.concesionariaId).toBe(adminConcesionariaId);
            expect(check.data.sucursalId).toBe(sucursalAId);
        });

        test('mover a otro tenant CON la sucursal del destino => 200', async () => {
            // La contracara: el movimiento coherente tiene que poder hacerse.
            // Validando contra el tenant actual esto daba 400 y no había forma de
            // mover a nadie de concesionaria sin dejarlo sin sucursal.
            const res = await api.patch(
                `/api/usuarios/${usuarioMoverId}`,
                { concesionariaId: tenantBId, sucursalId: sucursalBId },
                authHeaders(saToken)
            );
            expect(res.status).toBe(200);

            const check = await api.get(`/api/usuarios/${usuarioMoverId}`, authHeaders(saToken));
            expect(check.data.concesionariaId).toBe(tenantBId);
            expect(check.data.sucursalId).toBe(sucursalBId);
        });
    });
});
