import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique } from './helpers';

/**
 * Regresión: subir archivos bajo el rol app_rw (RLS activa).
 *
 * Multer lee el cuerpo por eventos del stream de la request, que no conservan el
 * AsyncLocalStorage (usuario/tenant). Sin re-entrar al contexto, lo que corría después de la
 * subida veía un tenant vacío y la RLS ocultaba todas las filas: una subida VÁLIDA daba
 * 404 "Vehículo no encontrado". Con el rol superusuario (que saltea la RLS) no se ve, así que
 * el job "integration" normal no lo detectaba: este test importa sobre todo en el job
 * "integration bajo app_rw / RLS".
 */
describe('Uploads bajo RLS (rol app_rw)', () => {
    let adToken: string;
    let vehiculoId: number;

    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 0)]);

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        const ad = await loginAsAdmin();
        adToken = ad.token;
        const tenantId = ad.user.concesionariaId!;

        const suc = await api.post('/api/sucursales', { nombre: unique('SucRls'), concesionariaId: tenantId }, authHeaders(sa.token));
        expect(suc.status).toBe(201);
        const veh = await api.post(
            '/api/vehiculos',
            {
                marca: unique('MRls'), modelo: 'V', anio: 2021, concesionariaId: tenantId, sucursalId: suc.data.id,
                fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO', precioCompra: 5000, precioLista: 6000,
                estado: 'publicado', origen: 'compra',
            },
            authHeaders(sa.token),
        );
        expect(veh.status).toBe(201);
        vehiculoId = veh.data.id;
    });

    const form = (campos: Record<string, string> = {}) => {
        const fd = new FormData();
        fd.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'foto.png');
        for (const [k, v] of Object.entries(campos)) fd.append(k, v);
        return fd;
    };
    const multipart = { headers: { Authorization: '', 'Content-Type': 'multipart/form-data' } };

    test('un admin sube una foto de un vehículo de SU concesionaria (201)', async () => {
        const r = await api.post('/api/vehiculo-archivos/upload', form({ vehiculoId: String(vehiculoId) }), {
            headers: { ...multipart.headers, Authorization: `Bearer ${adToken}` },
        });
        // El cuerpo viaja en el mensaje de fallo (sirve para diagnosticar en el CI).
        expect({ status: r.status, data: r.data }).toMatchObject({ status: 201 });
        expect(r.data.vehiculoId).toBe(vehiculoId);
    });

    test('el admin sube el logo de su concesionaria (200) y lo puede quitar', async () => {
        const r = await api.post('/api/concesionarias/me/logo', form(), {
            headers: { ...multipart.headers, Authorization: `Bearer ${adToken}` },
        });
        expect({ status: r.status, data: r.data }).toMatchObject({ status: 200 });
        expect(r.data.logoUrl).toBeTruthy();

        const del = await api.delete('/api/concesionarias/me/logo', authHeaders(adToken));
        expect(del.status).toBeLessThan(300);
    });
});
