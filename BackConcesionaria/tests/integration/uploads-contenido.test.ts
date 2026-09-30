import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique } from './helpers';

/**
 * Uploads (auditoría de seguridad, H8):
 *  - el tipo se valida por CONTENIDO (magic bytes), no por el mimetype/extensión declarados;
 *  - la extensión guardada sale del contenido, no del nombre del archivo;
 *  - los adjuntos de solicitudes de financiación (DNI, recibos) no se sirven sin URL firmada;
 *  - las fotos de vehículos siguen públicas (Mercado Libre las baja de una URL).
 * La firma/vencimiento de las URLs y los intentos de esquivar el guarda se prueban a fondo en
 * tests/unit/uploadsSeguros.test.ts (servidor real sobre un directorio temporal).
 */
describe('Uploads: contenido, extensión y zona privada', () => {
    let saToken: string;
    let adToken: string;
    let vehiculoId: number;

    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 0)]);

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        const ad = await loginAsAdmin();
        saToken = sa.token;
        adToken = ad.token;
        const tenantId = ad.user.concesionariaId!;

        const suc = await api.post('/api/sucursales', { nombre: unique('SucUp'), concesionariaId: tenantId }, authHeaders(saToken));
        expect(suc.status).toBe(201);
        const veh = await api.post(
            '/api/vehiculos',
            {
                marca: unique('MUp'), modelo: 'V', anio: 2021, concesionariaId: tenantId, sucursalId: suc.data.id,
                fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO', precioCompra: 5000, precioLista: 6000,
                estado: 'publicado', origen: 'compra',
            },
            authHeaders(saToken),
        );
        expect(veh.status).toBe(201);
        vehiculoId = veh.data.id;
    });

    const subir = (buf: Buffer, nombre: string, tipo: string) => {
        const fd = new FormData();
        fd.append('file', new Blob([new Uint8Array(buf)], { type: tipo }), nombre);
        fd.append('vehiculoId', String(vehiculoId));
        return api.post('/api/vehiculo-archivos/upload', fd, {
            headers: { Authorization: `Bearer ${adToken}`, 'Content-Type': 'multipart/form-data' },
        });
    };

    test('una imagen real se sube y se guarda con extensión .png', async () => {
        const r = await subir(PNG, 'foto.png', 'image/png');
        // El cuerpo viaja en el mensaje de fallo (sirve para diagnosticar en el CI).
        expect({ status: r.status, data: r.data }).toMatchObject({ status: 201 });
        expect(r.data.storageKey).toMatch(/\.png$/);
        expect(r.data.mimeType).toBe('image/png');
    });

    test('la extensión sale del CONTENIDO: un PNG llamado "x.html" se guarda como .png', async () => {
        const r = await subir(PNG, 'x.html', 'image/png');
        expect(r.status).toBe(201);
        expect(r.data.storageKey).toMatch(/\.png$/);
        expect(r.data.storageKey).not.toMatch(/html/);
    });

    test('HTML disfrazado de imagen (Content-Type image/png) → 400 ARCHIVO_INVALIDO', async () => {
        const r = await subir(Buffer.from('<html><script>alert(1)</script></html>'), 'foto.png', 'image/png');
        expect(r.status).toBe(400);
        expect(r.data.error).toBe('ARCHIVO_INVALIDO');
    });

    test('un ejecutable disfrazado de PDF → 400', async () => {
        const exe = Buffer.concat([Buffer.from('MZ'), Buffer.from([0x90, 0, 3, 0]), Buffer.alloc(64, 1)]);
        const r = await subir(exe, 'factura.pdf', 'application/pdf');
        expect(r.status).toBe(400);
        expect(r.data.error).toBe('ARCHIVO_INVALIDO');
    });

    test('un mimetype no permitido (svg) → 400, no 500', async () => {
        const r = await subir(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg', 'image/svg+xml');
        expect(r.status).toBe(400);
    });

    test('la foto de un vehículo es PÚBLICA (sin sesión) y cacheable, con nosniff y CSP sandbox', async () => {
        const up = await subir(PNG, 'publica.png', 'image/png');
        expect(up.status).toBe(201);
        const r = await api.get(up.data.url, { responseType: 'arraybuffer' });
        expect(r.status).toBe(200);
        expect(r.headers['content-type']).toContain('image/png');
        expect(r.headers['x-content-type-options']).toBe('nosniff');
        expect(r.headers['content-security-policy']).toContain('sandbox');
        expect(r.headers['cache-control']).toContain('public');
    });

    test('la zona privada (/uploads/solicitudes) NO se sirve sin URL firmada', async () => {
        const r = await api.get('/uploads/solicitudes/1/2026-09/cualquiera.pdf');
        expect(r.status).toBe(403);
        expect(r.headers['cache-control']).toBe('no-store');
    });

    test.each([
        '/uploads/%73olicitudes/1/2026-09/cualquiera.pdf',
        '/uploads//solicitudes/1/2026-09/cualquiera.pdf',
        '/uploads/vehiculos/../solicitudes/1/2026-09/cualquiera.pdf',
    ])('esquivar el guarda (%s) tampoco entrega nada', async (url) => {
        const r = await api.get(url);
        expect([403, 404]).toContain(r.status);
    });

    test('una firma inventada se rechaza', async () => {
        const r = await api.get(`/uploads/solicitudes/1/2026-09/x.pdf?exp=${Math.floor(Date.now() / 1000) + 600}&sig=${'a'.repeat(64)}`);
        expect(r.status).toBe(403);
    });
});
