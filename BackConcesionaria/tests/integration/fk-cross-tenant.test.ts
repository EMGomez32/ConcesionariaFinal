import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * Integridad cross-tenant de las FKs del body.
 *
 * La política RLS `tenant_iso` sólo valida el concesionaria_id de la fila que se
 * escribe, NO que sus FKs (sucursalId, clienteId, vehiculoId, ...) apunten a
 * filas del mismo tenant. El guard `assertMismoTenant` cierra ese hueco:
 *   - para un admin, la extensión Prisma filtra por su tenant, así que una FK
 *     ajena "no existe" → 404;
 *   - para super_admin (que ve todo) se compara el concesionariaId destino y el
 *     cruce se rechaza con 400 CROSS_TENANT.
 *
 * Espejo estructural de multi-tenancy.test.ts. Requiere el stack corriendo
 * (API_BASE_URL) con superadmin@demo.com y admin@demo.com.
 */
describe('Integridad cross-tenant de FKs del body', () => {
    let saToken: string;
    let adToken: string;
    let adTenantId: number;
    let adVendedorId: number;

    // Tenant B (ajeno), creado por super_admin.
    let tenantBId: number;
    let sucursalBId: number;
    let clienteBId: number;

    // Fixtures del tenant del admin (tenant A).
    let sucursalAId: number;
    let vehiculoAId: number;
    let clienteAId: number;

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        const ad = await loginAsAdmin();
        saToken = sa.token;
        adToken = ad.token;
        adTenantId = ad.user.concesionariaId!;
        adVendedorId = ad.user.id;

        // --- Tenant B ajeno (super_admin puede crear en cualquier concesionaria) ---
        const tenantRes = await api.post(
            '/api/concesionarias',
            { nombre: unique('TenantB'), cuit: '20-' + Date.now() + '-3' },
            authHeaders(saToken),
        );
        expect(tenantRes.status).toBe(201);
        tenantBId = tenantRes.data.id;

        const sucBRes = await api.post(
            '/api/sucursales',
            { nombre: unique('SucB'), concesionariaId: tenantBId },
            authHeaders(saToken),
        );
        expect(sucBRes.status).toBe(201);
        sucursalBId = sucBRes.data.id;

        const cliBRes = await api.post(
            '/api/clientes',
            { nombre: unique('CliB'), concesionariaId: tenantBId },
            authHeaders(saToken),
        );
        expect(cliBRes.status).toBe(201);
        clienteBId = cliBRes.data.id;

        // --- Fixtures del tenant A (los crea super_admin en adTenantId para no
        // depender de permisos de ABM del admin ni del contenido del seed) ---
        const sucARes = await api.post(
            '/api/sucursales',
            { nombre: unique('SucA'), concesionariaId: adTenantId },
            authHeaders(saToken),
        );
        expect(sucARes.status).toBe(201);
        sucursalAId = sucARes.data.id;

        const vehARes = await api.post(
            '/api/vehiculos',
            {
                marca: unique('M'), modelo: 'V', anio: 2020,
                concesionariaId: adTenantId, sucursalId: sucursalAId,
                fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO',
                precioCompra: 5000, precioLista: 6000, estado: 'publicado', origen: 'compra',
            },
            authHeaders(saToken),
        );
        expect(vehARes.status).toBe(201);
        vehiculoAId = vehARes.data.id;

        // Cliente propio, creado por el admin (la extensión inyecta su tenant).
        const cliARes = await api.post(
            '/api/clientes',
            { nombre: unique('CliA') },
            authHeaders(adToken),
        );
        expect(cliARes.status).toBe(201);
        clienteAId = cliARes.data.id;
    });

    afterAll(async () => {
        await tryDelete(`/api/vehiculos/${vehiculoAId}`, saToken);
        await tryDelete(`/api/clientes/${clienteAId}`, adToken);
        await tryDelete(`/api/sucursales/${sucursalAId}`, saToken);
        await tryDelete(`/api/clientes/${clienteBId}`, saToken);
        await tryDelete(`/api/sucursales/${sucursalBId}`, saToken);
        await tryDelete(`/api/concesionarias/${tenantBId}`, saToken);
    });

    // ---- Camino ADMIN: la FK ajena es invisible → 404 ------------------------

    test('admin NO puede crear un vehículo apuntando a una sucursal de otro tenant', async () => {
        const res = await api.post(
            '/api/vehiculos',
            {
                marca: unique('Hack'), modelo: 'X', anio: 2021,
                sucursalId: sucursalBId, // ← ajena
                fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO',
                precioCompra: 1000, precioLista: 2000, estado: 'publicado', origen: 'compra',
            },
            authHeaders(adToken),
        );
        expect(res.status).toBe(404);
    });

    test('admin NO puede reservar con un cliente de otro tenant', async () => {
        const res = await api.post(
            '/api/reservas',
            {
                sucursalId: sucursalAId, vendedorId: adVendedorId,
                clienteId: clienteBId, // ← ajeno
                vehiculoId: vehiculoAId,
                monto: 1000, moneda: 'ARS', fechaVencimiento: '2026-12-31',
            },
            authHeaders(adToken),
        );
        expect(res.status).toBe(404);
    });

    test('admin NO puede reservar apuntando a una sucursal de otro tenant', async () => {
        const res = await api.post(
            '/api/reservas',
            {
                sucursalId: sucursalBId, // ← ajena
                vendedorId: adVendedorId, clienteId: clienteAId,
                vehiculoId: vehiculoAId,
                monto: 1000, moneda: 'ARS', fechaVencimiento: '2026-12-31',
            },
            authHeaders(adToken),
        );
        expect(res.status).toBe(404);
    });

    test('admin NO puede trasladar un vehículo a una sucursal de otro tenant', async () => {
        const res = await api.post(
            '/api/vehiculo-movimientos',
            { vehiculoId: vehiculoAId, tipo: 'traslado', hastaSucursalId: sucursalBId },
            authHeaders(adToken),
        );
        expect(res.status).toBe(404);
    });

    // ---- Camino SUPER_ADMIN: ve todo, pero se rechaza el cruce con 400 -------

    test('super_admin NO puede crear un vehículo en el tenant A con una sucursal del tenant B', async () => {
        const res = await api.post(
            '/api/vehiculos',
            {
                marca: unique('Mix'), modelo: 'Y', anio: 2021,
                concesionariaId: adTenantId,   // fila destino: tenant A
                sucursalId: sucursalBId,        // ← FK del tenant B
                fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO',
                precioCompra: 1000, precioLista: 2000, estado: 'publicado', origen: 'compra',
            },
            authHeaders(saToken),
        );
        expect(res.status).toBe(400);
        expect(res.data?.error).toBe('CROSS_TENANT');
    });

    // ---- Control positivo: un alta legítima del mismo tenant sigue funcionando

    test('admin SÍ puede reservar con FKs de su propio tenant', async () => {
        const res = await api.post(
            '/api/reservas',
            {
                sucursalId: sucursalAId, vendedorId: adVendedorId,
                clienteId: clienteAId, vehiculoId: vehiculoAId,
                monto: 1000, moneda: 'ARS', fechaVencimiento: '2026-12-31',
            },
            authHeaders(adToken),
        );
        expect(res.status).toBe(201);
        // Cleanup: liberar el vehículo cancelando la reserva.
        await tryDelete(`/api/reservas/${res.data.id}`, adToken);
    });
});
