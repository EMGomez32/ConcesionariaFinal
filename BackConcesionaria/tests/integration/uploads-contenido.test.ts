import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique } from './helpers';
// La firma la arma el MISMO helper que el backend: el proceso de tests corre con el mismo
// JWT_SECRET que el servidor (el CI y la receta local lo exportan a los dos).
import { firmarRuta } from '../../src/infrastructure/security/urlFirmada';

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

    test('una ruta privada NO se sirve sin firma (layout viejo y layout real del storage)', async () => {
        for (const url of ['/uploads/solicitudes/1/2026-09/cualquiera.pdf', '/uploads/solicitudes-1/2026-09/cualquiera.pdf']) {
            const r = await api.get(url);
            expect(r.status).toBe(403);
            expect(r.headers['cache-control']).toBe('private, no-store');
        }
    });

    test.each([
        '/uploads/%73olicitudes-1/2026-09/cualquiera.pdf',
        '/uploads//solicitudes-1/2026-09/cualquiera.pdf',
        '/uploads/vehiculos-1/../solicitudes-1/2026-09/cualquiera.pdf',
        '/uploads/SOLICITUDES-1/2026-09/cualquiera.pdf',
    ])('esquivar el guarda (%s) tampoco entrega nada', async (url) => {
        const r = await api.get(url);
        expect([403, 404]).toContain(r.status);
    });

    test('una firma inventada se rechaza', async () => {
        const r = await api.get(`/uploads/solicitudes-1/2026-09/x.pdf?exp=${Math.floor(Date.now() / 1000) + 600}&sig=${'a'.repeat(64)}`);
        expect(r.status).toBe(403);
    });
});

const FIRMADA = /\?exp=\d+&sig=[0-9a-f]{64}$/;

/**
 * APP-01 con el FLUJO REAL: el adjunto se sube por la API a una solicitud de verdad y se
 * pide por la URL que devuelve el backend. Antes los tests pedían `/uploads/solicitudes/…`,
 * una ruta que el storage nunca genera (guarda en `solicitudes-<id>/…`), y el control
 * pasaba en verde mientras los DNI salían sin firma.
 */
describe('Adjuntos de solicitudes de financiación: firma obligatoria (flujo real)', () => {
    let adToken: string;
    let solicitudId: number;
    const PDF = Buffer.concat([Buffer.from('%PDF-1.7\nDNI-DE-PRUEBA\n', 'latin1'), Buffer.alloc(64, 0x20)]);
    let urlFirmada: string;
    let ruta: string;

    beforeAll(async () => {
        adToken = (await loginAsAdmin()).token;
        const cli = await api.post('/api/clientes', { nombre: unique('CliAdj') }, authHeaders(adToken));
        expect(cli.status).toBe(201);
        const fin = await api.post('/api/financieras', { nombre: unique('BancoAdj'), tipo: 'banco' }, authHeaders(adToken));
        expect(fin.status).toBe(201);
        const sol = await api.post('/api/financiacion-solicitudes', { clienteId: cli.data.id, financieraId: fin.data.id }, authHeaders(adToken));
        expect(sol.status).toBe(201);
        solicitudId = sol.data.id;

        const fd = new FormData();
        fd.append('file', new Blob([new Uint8Array(PDF)], { type: 'application/pdf' }), 'dni.pdf');
        fd.append('tipo', 'dni');
        const up = await api.post(`/api/financiacion-solicitudes/${solicitudId}/archivos/upload`, fd, {
            headers: { Authorization: `Bearer ${adToken}`, 'Content-Type': 'multipart/form-data' },
        });
        expect({ status: up.status, data: up.data }).toMatchObject({ status: 201 });
        urlFirmada = up.data.url;
        ruta = urlFirmada.split('?')[0];
    });

    test('el storage lo guarda con el layout real (solicitudes-<id>/…) y la API devuelve una URL firmada', () => {
        expect(ruta).toMatch(new RegExp(`^/uploads/solicitudes-${solicitudId}/\\d{4}-\\d{2}/[0-9a-f]{32}\\.pdf$`));
        expect(urlFirmada).toMatch(FIRMADA);
    });

    test('SIN firma → 403 y sin cache', async () => {
        const r = await api.get(ruta, { responseType: 'arraybuffer' });
        expect(r.status).toBe(403);
        expect(r.headers['cache-control']).toBe('private, no-store');
        expect(Buffer.from(r.data).toString('latin1')).not.toContain('DNI-DE-PRUEBA');
    });

    test('con la firma vigente que dio la API → 200, el archivo, y sin cache compartido', async () => {
        const r = await api.get(urlFirmada, { responseType: 'arraybuffer' });
        expect(r.status).toBe(200);
        expect(Buffer.from(r.data).toString('latin1')).toContain('DNI-DE-PRUEBA');
        expect(r.headers['cache-control']).toBe('private, no-store');
        expect(r.headers['x-content-type-options']).toBe('nosniff');
    });

    test('el listado de adjuntos también entrega una URL firmada que abre', async () => {
        const lista = await api.get(`/api/financiacion-solicitudes/${solicitudId}/archivos`, authHeaders(adToken));
        expect(lista.status).toBe(200);
        const url: string = lista.data[0].url;
        expect(url.split('?')[0]).toBe(ruta);
        expect((await api.get(url, { responseType: 'arraybuffer' })).status).toBe(200);
    });

    test('con una firma VENCIDA (bien firmada, pero con exp en el pasado) → 403', async () => {
        const vencida = firmarRuta(ruta, 60, Date.now() - 2 * 3600_000);
        expect((await api.get(vencida)).status).toBe(403);
    });

    test('la firma de este archivo no abre OTRO archivo de la misma solicitud', async () => {
        const query = urlFirmada.split('?')[1];
        const otra = ruta.replace(/[0-9a-f]{32}\.pdf$/, `${'b'.repeat(32)}.pdf`);
        expect((await api.get(`${otra}?${query}`)).status).toBe(403);
    });
});

/**
 * PRIV-11: los documentos del vehículo (título, cédula, boleto) van a la zona privada; las
 * fotos siguen públicas (Mercado Libre las baja de una URL abierta).
 */
describe('Documentos de vehículos: zona privada con firma (flujo real)', () => {
    let saToken: string;
    let adToken: string;
    let vehiculoId: number;
    const PDF = Buffer.concat([Buffer.from('%PDF-1.7\nTITULO-DE-PRUEBA\n', 'latin1'), Buffer.alloc(64, 0x20)]);

    beforeAll(async () => {
        saToken = (await loginAsSuperAdmin()).token;
        const ad = await loginAsAdmin();
        adToken = ad.token;
        const tenantId = ad.user.concesionariaId!;
        const suc = await api.post('/api/sucursales', { nombre: unique('SucDoc'), concesionariaId: tenantId }, authHeaders(saToken));
        expect(suc.status).toBe(201);
        const veh = await api.post('/api/vehiculos', {
            marca: unique('MDoc'), modelo: 'V', anio: 2021, concesionariaId: tenantId, sucursalId: suc.data.id,
            fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO', precioCompra: 5000, precioLista: 6000,
            estado: 'publicado', origen: 'compra',
        }, authHeaders(saToken));
        expect(veh.status).toBe(201);
        vehiculoId = veh.data.id;
    });

    const subir = (tipo: string) => {
        const fd = new FormData();
        fd.append('file', new Blob([new Uint8Array(PDF)], { type: 'application/pdf' }), 'titulo.pdf');
        fd.append('vehiculoId', String(vehiculoId));
        fd.append('tipo', tipo);
        return api.post('/api/vehiculo-archivos/upload', fd, {
            headers: { Authorization: `Bearer ${adToken}`, 'Content-Type': 'multipart/form-data' },
        });
    };

    test.each(['documento', 'comprobante'])('un %s se guarda en vehiculos-docs-<id>/ y no abre sin firma', async (tipo) => {
        const up = await subir(tipo);
        expect({ status: up.status, data: up.data }).toMatchObject({ status: 201 });
        expect(up.data.storageKey).toMatch(new RegExp(`^vehiculos-docs-${vehiculoId}/`));
        expect(up.data.url).toMatch(FIRMADA);
        const ruta = String(up.data.url).split('?')[0];

        const sinFirma = await api.get(ruta);
        expect(sinFirma.status).toBe(403);
        expect(sinFirma.headers['cache-control']).toBe('private, no-store');

        const ok = await api.get(up.data.url, { responseType: 'arraybuffer' });
        expect(ok.status).toBe(200);
        expect(Buffer.from(ok.data).toString('latin1')).toContain('TITULO-DE-PRUEBA');
        expect(ok.headers['cache-control']).toBe('private, no-store');
    });

    test('el listado de archivos y la ficha del vehículo entregan el documento firmado', async () => {
        const lista = await api.get(`/api/vehiculo-archivos/vehiculo/${vehiculoId}`, authHeaders(adToken));
        expect(lista.status).toBe(200);
        const doc = lista.data.find((a: any) => a.tipo === 'documento');
        expect(doc.url).toMatch(FIRMADA);
        expect((await api.get(doc.url, { responseType: 'arraybuffer' })).status).toBe(200);

        const ficha = await api.get(`/api/vehiculos/${vehiculoId}`, authHeaders(adToken));
        expect(ficha.status).toBe(200);
        const enFicha = (ficha.data.archivos ?? []).find((a: any) => a.id === doc.id);
        expect(enFicha.url).toMatch(FIRMADA);
    });
});
