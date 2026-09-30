import express from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import request from 'supertest';

// Unit tests (sin DB): validación de contenido de archivos subidos, extensión derivada del
// contenido, y zona privada de /uploads con URLs firmadas.
jest.mock('../../src/config/env', () => ({ env: { JWT_SECRET: 'secreto-de-prueba-1234567890', NODE_ENV: 'test' } }));

import { detectarTipoArchivo, extensionParaMime } from '../../src/infrastructure/security/contenidoArchivo';
import { firmarRuta, verificarRutaFirmada } from '../../src/infrastructure/security/urlFirmada';
import { LocalStorageAdapter } from '../../src/infrastructure/storage/LocalStorageAdapter';
import { crearRouterUploads, esRutaPrivada, rutaNormalizada } from '../../src/interface/middlewares/uploads.middleware';
import { uploadSingle } from '../../src/interface/middlewares/upload.middleware';
import { BaseException } from '../../src/domain/exceptions/BaseException';
import { context } from '../../src/infrastructure/security/context';

const relleno = (n: number) => Buffer.alloc(n, 0x41);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), relleno(32)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), relleno(32)]);
const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), relleno(32)]);
const webp = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBP', 'latin1'), relleno(16)]);
const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic', 'latin1'), relleno(16)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), relleno(32)]);
const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), relleno(32)]);
const zipConCarpeta = (dir: string) =>
    Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), relleno(20), Buffer.from(`${dir}document.xml`, 'latin1'), relleno(16)]);

describe('detectarTipoArchivo (por magic bytes)', () => {
    test.each([
        ['PNG', png, 'image/png', 'png'],
        ['JPEG', jpg, 'image/jpeg', 'jpg'],
        ['GIF', gif, 'image/gif', 'gif'],
        ['WEBP', webp, 'image/webp', 'webp'],
        ['HEIC', heic, 'image/heic', 'heic'],
        ['PDF', pdf, 'application/pdf', 'pdf'],
        ['DOCX', zipConCarpeta('word/'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
        ['XLSX', zipConCarpeta('xl/'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    ])('reconoce %s', (_n, buf, mime, ext) => {
        expect(detectarTipoArchivo(buf as Buffer)).toEqual({ mime, ext });
    });

    test('el tipo sale del CONTENIDO: un PDF declarado como PNG es PDF', () => {
        expect(detectarTipoArchivo(pdf, 'image/png')).toEqual({ mime: 'application/pdf', ext: 'pdf' });
    });

    test('OLE2: doc vs xls lo desempata lo declarado; sin declarar no se acepta', () => {
        expect(detectarTipoArchivo(ole, 'application/msword')).toEqual({ mime: 'application/msword', ext: 'doc' });
        expect(detectarTipoArchivo(ole, 'application/vnd.ms-excel')).toEqual({ mime: 'application/vnd.ms-excel', ext: 'xls' });
        expect(detectarTipoArchivo(ole, 'image/png')).toBeNull();
        expect(detectarTipoArchivo(ole)).toBeNull();
    });

    test('texto plano y CSV', () => {
        expect(detectarTipoArchivo(Buffer.from('hola mundo\nsegunda línea\n'), 'text/plain')).toEqual({ mime: 'text/plain', ext: 'txt' });
        expect(detectarTipoArchivo(Buffer.from('a;b;c\n1;2;3\n'), 'text/csv')).toEqual({ mime: 'text/csv', ext: 'csv' });
        // Excel en Windows declara los .csv como application/vnd.ms-excel.
        expect(detectarTipoArchivo(Buffer.from('a;b;c\n1;2;3\n'), 'application/vnd.ms-excel')).toEqual({ mime: 'text/csv', ext: 'csv' });
    });

    test.each([
        ['HTML', Buffer.from('<!DOCTYPE html><html><script>alert(1)</script></html>')],
        ['HTML con espacios y BOM', Buffer.from('﻿   \n<html><body>x</body></html>')],
        ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')],
        ['XML', Buffer.from('<?xml version="1.0"?><a/>')],
        ['ejecutable Windows (MZ)', Buffer.concat([Buffer.from('MZ'), Buffer.from([0x90, 0x00, 0x03, 0x00]), relleno(32)])],
        ['ELF', Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from([0, 1, 1, 0]), relleno(32)])],
        ['ZIP cualquiera (no OOXML)', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), relleno(64)])],
        ['binario con NUL', Buffer.from([0x01, 0x02, 0x00, 0x03, 0x04, 0x05, 0x06, 0x07])],
        ['muy corto', Buffer.from([0xff, 0xd8])],
        ['vacío', Buffer.alloc(0)],
    ])('rechaza %s', (_n, buf) => {
        expect(detectarTipoArchivo(buf as Buffer, 'image/png')).toBeNull();
        expect(detectarTipoArchivo(buf as Buffer, 'text/plain')).toBeNull();
    });
});

describe('extensionParaMime', () => {
    test('sólo devuelve extensiones seguras y "bin" para lo desconocido', () => {
        expect(extensionParaMime('image/jpeg')).toBe('jpg');
        expect(extensionParaMime('application/pdf')).toBe('pdf');
        expect(extensionParaMime('text/html')).toBe('bin');
        expect(extensionParaMime('image/svg+xml')).toBe('bin');
        expect(extensionParaMime(undefined)).toBe('bin');
    });
});

describe('LocalStorageAdapter: la extensión NO sale del originalname', () => {
    let base: string;
    beforeEach(async () => { base = await fs.mkdtemp(path.join(os.tmpdir(), 'up-')); });
    afterEach(async () => { await fs.rm(base, { recursive: true, force: true }); });

    const guardar = (over: object) =>
        new LocalStorageAdapter(base).save({ buffer: Buffer.from('x'), size: 1, originalname: 'a', mimetype: 'application/pdf', ...over } as any, 'vehiculos/1');

    test('originalname malicioso con extensión validada por contenido → sólo la validada', async () => {
        const r = await guardar({ originalname: 'evil.html', mimetype: 'image/png', extension: 'png' });
        expect(r.storageKey.endsWith('.png')).toBe(true);
        expect(r.storageKey).not.toMatch(/html/);
    });

    test('sin extension explícita se deriva del mimetype validado', async () => {
        expect((await guardar({ originalname: 'x.svg', mimetype: 'application/pdf' })).storageKey.endsWith('.pdf')).toBe(true);
    });

    test('mimetype desconocido → .bin, nunca lo que diga el nombre', async () => {
        expect((await guardar({ originalname: 'x.html', mimetype: 'text/html' })).storageKey.endsWith('.bin')).toBe(true);
    });

    test('una "extension" con caracteres raros se ignora', async () => {
        const r = await guardar({ originalname: 'x', mimetype: 'application/pdf', extension: '../x' });
        expect(r.storageKey.endsWith('.pdf')).toBe(true);
    });
});

// ── Pipeline de subida: multer + validación de contenido ─────────────────────
describe('uploadSingle (multer + contenido)', () => {
    const app = express();
    app.post('/up', uploadSingle, (req: express.Request, res: express.Response) => {
        const f = (req as any).file;
        res.json({ mimetype: f?.mimetype, extension: f?.extension });
    });
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(err instanceof BaseException ? err.statusCode : 500).json({ error: err.errorCode ?? 'INTERNAL', message: err.message });
    });

    const subir = (buf: Buffer, filename: string, contentType: string) =>
        request(app).post('/up').attach('file', buf, { filename, contentType });

    test('una imagen real pasa y el tipo sale del contenido', async () => {
        const r = await subir(png, 'foto.png', 'image/png');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ mimetype: 'image/png', extension: 'png' });
    });

    test('un PDF real declarado con otro mimetype permitido queda como PDF', async () => {
        const r = await subir(pdf, 'x.png', 'image/png');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ mimetype: 'application/pdf', extension: 'pdf' });
    });

    test('HTML disfrazado de imagen (image/png) → 400 ARCHIVO_INVALIDO', async () => {
        const r = await subir(Buffer.from('<html><script>alert(1)</script></html>'), 'foto.png', 'image/png');
        expect(r.status).toBe(400);
        expect(r.body.error).toBe('ARCHIVO_INVALIDO');
    });

    test('ejecutable disfrazado de PDF → 400', async () => {
        const exe = Buffer.concat([Buffer.from('MZ'), Buffer.from([0x90, 0, 3, 0]), relleno(64)]);
        const r = await subir(exe, 'factura.pdf', 'application/pdf');
        expect(r.status).toBe(400);
        expect(r.body.error).toBe('ARCHIVO_INVALIDO');
    });

    test('un mimetype fuera de la lista (svg, html) se rechaza con 400 (no 500)', async () => {
        for (const tipo of ['image/svg+xml', 'text/html', 'application/x-msdownload']) {
            const r = await subir(png, 'x.bin', tipo);
            expect(r.status).toBe(400);
            expect(r.body.error).toBe('ARCHIVO_INVALIDO');
        }
    });

    test('el contexto de la request (usuario/tenant) sigue disponible DESPUÉS de la subida', async () => {
        // Sin esto, bajo app_rw la RLS no ve ninguna fila y un upload válido da 404.
        const ctxApp = express();
        ctxApp.use((_req, _res, next) => context.run({ user: { userId: 7, concesionariaId: 3 }, correlationId: 'abc' } as any, () => next()));
        ctxApp.post('/ctx', uploadSingle, (_req: express.Request, res: express.Response) => {
            res.json({ tenant: context.getTenantId() ?? null, corr: context.getCorrelationId() ?? null });
        });
        const r = await request(ctxApp).post('/ctx').attach('file', png, { filename: 'f.png', contentType: 'image/png' });
        expect(r.body).toEqual({ tenant: 3, corr: 'abc' });
    });

    test('sin archivo pasa al handler (cada controller decide si es obligatorio)', async () => {
        const r = await request(app).post('/up');
        expect(r.status).toBe(200);
    });
});

// ── URLs firmadas ────────────────────────────────────────────────────────────
describe('urlFirmada', () => {
    const ruta = '/uploads/solicitudes/7/2026-09/abc.pdf';
    const parsear = (u: string) => { const q = new URL(`http://x${u}`).searchParams; return { exp: q.get('exp'), sig: q.get('sig') }; };

    test('una URL recién firmada se verifica', () => {
        const { exp, sig } = parsear(firmarRuta(ruta));
        expect(verificarRutaFirmada(ruta, exp, sig)).toBe(true);
    });

    test('vence', () => {
        const t0 = 1_700_000_000_000;
        const { exp, sig } = parsear(firmarRuta(ruta, 60, t0));
        expect(verificarRutaFirmada(ruta, exp, sig, t0 + 30_000)).toBe(true);
        expect(verificarRutaFirmada(ruta, exp, sig, t0 + 61_000)).toBe(false);
    });

    test('no sirve para OTRA ruta ni con el exp alterado ni con la firma tocada', () => {
        const { exp, sig } = parsear(firmarRuta(ruta));
        expect(verificarRutaFirmada('/uploads/solicitudes/8/2026-09/abc.pdf', exp, sig)).toBe(false);
        expect(verificarRutaFirmada(ruta, String(Number(exp) + 99999), sig)).toBe(false);
        expect(verificarRutaFirmada(ruta, exp, `${'0'.repeat(63)}1`)).toBe(false);
    });

    test.each([[undefined, undefined], ['abc', 'def'], ['', ''], ['123', 'zz'], [['1'], ['2']]])(
        'parámetros inválidos (%p, %p) → false', (exp, sig) => {
            expect(verificarRutaFirmada(ruta, exp, sig)).toBe(false);
        });
});

// ── Zona privada de /uploads ─────────────────────────────────────────────────
describe('rutaNormalizada / esRutaPrivada', () => {
    test.each([
        '/solicitudes/1/x.pdf', '/%73olicitudes/1/x.pdf', '//solicitudes/1/x.pdf', '/./solicitudes/1/x.pdf',
        '/vehiculos/../solicitudes/1/x.pdf', '/SOLICITUDES/1/x.pdf', '/solicitudes', '/%53olicitudes/1/x', '/solicitudes//1/x',
        '/vehiculos/..%2fsolicitudes/1/x.pdf', '/x/%2e%2e/solicitudes/1/x.pdf', '/\\solicitudes/1/x.pdf',
    ])('%s es zona privada (no se puede esquivar con encoding, //, .. ni mayúsculas)', (p) => {
        const n = rutaNormalizada(p);
        expect(n).not.toBeNull();
        expect(esRutaPrivada(n as string)).toBe(true);
    });

    test.each(['/vehiculos/1/x.png', '/concesionarias/1/branding/logo.png', '/solicitudesx/1/x', '/otra/solicitudes/1/x'])(
        '%s es zona pública', (p) => {
            expect(esRutaPrivada(rutaNormalizada(p) as string)).toBe(false);
        });

    test('un path mal codificado → null (se rechaza con 400)', () => {
        expect(rutaNormalizada('/%E0%A4%A')).toBeNull();
    });
});

describe('crearRouterUploads (servidor real sobre un directorio temporal)', () => {
    let dir: string;
    let app: express.Express;

    beforeAll(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uploads-srv-'));
        await fs.mkdir(path.join(dir, 'solicitudes', '7', '2026-09'), { recursive: true });
        await fs.mkdir(path.join(dir, 'vehiculos', '1', '2026-09'), { recursive: true });
        await fs.writeFile(path.join(dir, 'solicitudes', '7', '2026-09', 'dni.txt'), 'DATO PERSONAL');
        await fs.writeFile(path.join(dir, 'vehiculos', '1', '2026-09', 'foto.txt'), 'foto publica');
        app = express();
        app.use('/uploads', crearRouterUploads(dir));
    });

    afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });

    const privada = '/uploads/solicitudes/7/2026-09/dni.txt';

    test('el archivo privado SIN firma → 403 y sin cache', async () => {
        const r = await request(app).get(privada);
        expect(r.status).toBe(403);
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.text).not.toContain('DATO PERSONAL');
    });

    test('con URL firmada vigente → 200, sin cache compartido y con nosniff + CSP sandbox', async () => {
        const r = await request(app).get(firmarRuta(privada));
        expect(r.status).toBe(200);
        expect(r.text).toBe('DATO PERSONAL');
        expect(r.headers['cache-control']).toBe('private, no-store');
        expect(r.headers['x-content-type-options']).toBe('nosniff');
        expect(r.headers['content-security-policy']).toContain('sandbox');
    });

    test('firma vencida → 403', async () => {
        const vieja = firmarRuta(privada, 60, Date.now() - 3600_000);
        expect((await request(app).get(vieja)).status).toBe(403);
    });

    test('firma de OTRO archivo, o alterada → 403', async () => {
        const firmaDeOtro = firmarRuta('/uploads/solicitudes/7/2026-09/otro.txt').split('?')[1];
        expect((await request(app).get(`${privada}?${firmaDeOtro}`)).status).toBe(403);
        expect((await request(app).get(`${firmarRuta(privada)}0`)).status).toBe(403);
    });

    test.each([
        '/uploads/%73olicitudes/7/2026-09/dni.txt',
        '/uploads//solicitudes/7/2026-09/dni.txt',
        '/uploads/./solicitudes/7/2026-09/dni.txt',
        '/uploads/vehiculos/../solicitudes/7/2026-09/dni.txt',
        '/uploads/SOLICITUDES/7/2026-09/dni.txt',
    ])('intento de esquivar el guarda (%s) NUNCA entrega el archivo sin firma', async (url) => {
        const r = await request(app).get(url);
        expect(r.status).not.toBe(200);
        expect(r.text).not.toContain('DATO PERSONAL');
    });

    test('la zona PÚBLICA sigue abierta y cacheable (Mercado Libre baja las fotos de ahí)', async () => {
        const r = await request(app).get('/uploads/vehiculos/1/2026-09/foto.txt');
        expect(r.status).toBe(200);
        expect(r.text).toBe('foto publica');
        expect(r.headers['cache-control']).toContain('public');
        expect(r.headers['x-content-type-options']).toBe('nosniff');
    });

    test('no lista directorios', async () => {
        expect((await request(app).get('/uploads/vehiculos/')).status).toBe(404);
    });
});
