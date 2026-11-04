import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { LocalStorageAdapter } from '../../src/infrastructure/storage/LocalStorageAdapter';
import { createVehiculoArchivoSchema } from '../../src/interface/validation/vehiculo-archivo.schema';

// Unit tests PUROS (sin DB ni server). Regresión del path traversal: un
// storageKey persistido en BD con '..' no puede hacer que delete()/read() salgan
// del directorio de uploads.
describe('LocalStorageAdapter: contención del storageKey', () => {
    let base: string;
    let root: string;
    let adapter: LocalStorageAdapter;

    beforeEach(async () => {
        base = await fs.mkdtemp(path.join(os.tmpdir(), 'uploads-test-'));
        root = path.join(base, 'uploads');
        await fs.mkdir(root);
        adapter = new LocalStorageAdapter(root);
    });

    afterEach(async () => {
        await fs.rm(base, { recursive: true, force: true });
    });

    test('delete con ".." NO borra un archivo fuera de root', async () => {
        const victima = path.join(base, 'wa-auth-creds.json');
        await fs.writeFile(victima, 'secreto');
        await expect(adapter.delete('../wa-auth-creds.json')).rejects.toThrow(/fuera del directorio/);
        await expect(fs.readFile(victima, 'utf8')).resolves.toBe('secreto');
    });

    test('delete con ruta absoluta NO borra fuera de root', async () => {
        const victima = path.join(base, 'otro.txt');
        await fs.writeFile(victima, 'x');
        await expect(adapter.delete(victima)).rejects.toThrow(/fuera del directorio/);
        await expect(fs.readFile(victima, 'utf8')).resolves.toBe('x');
    });

    test('delete no permite borrar el propio root', async () => {
        await expect(adapter.delete('.')).rejects.toThrow(/fuera del directorio/);
        await expect(fs.stat(root)).resolves.toBeDefined();
    });

    test('read con ".." tampoco sale de root', async () => {
        await fs.writeFile(path.join(base, 'x.txt'), 'x');
        await expect(adapter.read('../x.txt')).rejects.toThrow(/fuera del directorio/);
    });

    test('flujo normal: save → read → delete sigue funcionando', async () => {
        const saved = await adapter.save(
            { originalname: 'foto.png', buffer: Buffer.from('img'), mimetype: 'image/png', size: 3 } as any,
            'vehiculos/1',
        );
        await expect(adapter.read(saved.storageKey)).resolves.toEqual(Buffer.from('img'));
        await adapter.delete(saved.storageKey);
        await expect(adapter.read(saved.storageKey)).rejects.toThrow();
    });

    test('delete de un archivo inexistente dentro de root es idempotente', async () => {
        await expect(adapter.delete('vehiculos/1/2026-09/no-existe.png')).resolves.toBeUndefined();
    });
});

describe('createVehiculoArchivoSchema: whitelist del alta JSON legacy', () => {
    const base = { vehiculoId: 5, url: 'https://ejemplo.com/ficha.pdf' };

    test('acepta el payload que manda el front', () => {
        const r = createVehiculoArchivoSchema.safeParse({ ...base, tipo: 'ficha', descripcion: 'PDF' });
        expect(r.success).toBe(true);
    });

    test('descarta storageKey, uploadedById, mimeType y demás campos no declarados', () => {
        const r = createVehiculoArchivoSchema.safeParse({
            ...base,
            storageKey: '../../etc/passwd',
            uploadedById: 1,
            mimeType: 'image/png',
            sizeBytes: 1,
            esPrincipal: true,
            concesionariaId: 99,
        });
        expect(r.success).toBe(true);
        expect(Object.keys((r as any).data).sort()).toEqual(['url', 'vehiculoId']);
    });

    test.each(['javascript:alert(1)', 'data:text/html,<script>', '/uploads/x.png', 'ftp://x.com/a', 'no es url'])(
        'rechaza url no http(s): %s',
        (url) => {
            expect(createVehiculoArchivoSchema.safeParse({ ...base, url }).success).toBe(false);
        },
    );

    test('vehiculoId obligatorio y positivo', () => {
        expect(createVehiculoArchivoSchema.safeParse({ url: base.url }).success).toBe(false);
        expect(createVehiculoArchivoSchema.safeParse({ ...base, vehiculoId: 0 }).success).toBe(false);
    });
});
