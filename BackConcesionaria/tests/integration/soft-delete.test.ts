import { api, loginAsSuperAdmin, authHeaders, unique } from './helpers';

describe('Soft delete (extension intercepta delete)', () => {
    let token: string;
    let concesionariaId: number;

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        token = sa.token;
        concesionariaId = sa.user.concesionariaId!;
    });

    test('DELETE proveedor devuelve 204 y luego GET devuelve 404 (filtro deletedAt)', async () => {
        const create = await api.post(
            '/api/proveedores',
            { nombre: unique('SoftDel'), tipo: 'taller', concesionariaId },
            authHeaders(token)
        );
        expect(create.status).toBe(201);
        const id = create.data.id;

        const del = await api.delete(`/api/proveedores/${id}`, authHeaders(token));
        expect(del.status).toBe(204);

        // Read filter: deletedAt: null aplicado por el extension
        const get = await api.get(`/api/proveedores/${id}`, authHeaders(token));
        expect(get.status).toBe(404);

        // El listado tampoco debe incluirlo
        const list = await api.get('/api/proveedores?limit=200', authHeaders(token));
        const ids = list.data.results.map((p: any) => p.id);
        expect(ids).not.toContain(id);
    });

    test('DeleteProveedor con guarda: bloquea si tiene gastos asociados', async () => {
        const prov = await api.post(
            '/api/proveedores',
            { nombre: unique('ProvWithGastos'), tipo: 'taller', concesionariaId },
            authHeaders(token)
        );
        const provId = prov.data.id;

        // Crear categoría + vehículo + gasto que use ese proveedor.
        // Como super_admin, el extension NO inyecta concesionariaId — pasarlo
        // explícito en cada create.
        const cat = await api.post(
            '/api/gastos-categorias',
            { nombre: unique('CatGasto'), concesionariaId },
            authHeaders(token)
        );
        const catId = cat.data.id;

        const veh = await api.post(
            '/api/vehiculos',
            {
                marca: 'TestMarca', modelo: 'TestModelo', anio: 2020,
                concesionariaId, sucursalId: 1,
                fechaIngreso: '2026-04-25T00:00:00Z',
                tipo: 'USADO', precioCompra: 1000, precioLista: 1500,
                estado: 'preparacion', origen: 'compra',
            },
            authHeaders(token)
        );
        const vehId = veh.data.id;

        const gasto = await api.post(
            '/api/gastos',
            {
                vehiculoId: vehId, categoriaId: catId,
                concesionariaId,
                proveedorId: provId, monto: 100,
                fecha: '2026-04-25T00:00:00Z',
                descripcion: 'gasto test',
            },
            authHeaders(token)
        );
        expect(gasto.status).toBe(201);

        // Intento borrar proveedor → debe fallar con 400 HAS_RELATIONS
        const del = await api.delete(`/api/proveedores/${provId}`, authHeaders(token));
        expect(del.status).toBe(400);

        // Cleanup en orden inverso
        await api.delete(`/api/gastos/${gasto.data.id}`, authHeaders(token));
        await api.delete(`/api/vehiculos/${vehId}`, authHeaders(token));
        await api.delete(`/api/proveedores/${provId}`, authHeaders(token));
        await api.delete(`/api/gastos-categorias/${catId}`, authHeaders(token));
    });
});
