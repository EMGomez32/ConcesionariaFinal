import crypto from 'crypto';
import path from 'path';
import { spawn } from 'child_process';
import { Pool } from 'pg';
import { api, loginAsAdmin, authHeaders, unique } from './helpers';
import { contextoSecreto, descifrarSecreto, inspeccionarSecreto, kidDeClave } from '../../src/infrastructure/security/secretBox';

/**
 * Cifrado en reposo v2 (APP-05) contra el stack real: lo que la API guarda sale en v2 atado a
 * su fila, el server lo lee (la firma del webhook de Meta se valida con el appSecret
 * descifrado), un blob movido de fila falla cerrado, lo legado (v1 y en claro) se sigue
 * leyendo, y `npm run recifrar-secretos` lo pasa a v2 sin imprimir nunca un secreto.
 *
 * Necesita DATABASE_URL (la conexión de migraciones, la del script) e
 * INTEGRACIONES_SECRET_KEY IGUAL a la del server: sin la clave el server guarda en claro y
 * no hay nada que probar (el CI la define con un valor de prueba).
 */

const DB_URL = process.env.DATABASE_URL;
const CLAVE = process.env.INTEGRACIONES_SECRET_KEY;
const describirConClave = DB_URL && CLAVE ? describe : describe.skip;

const BACK = path.resolve(__dirname, '../..');

/** Un v1 tal como lo escribía el código anterior (sin AAD ni kid). */
function sobreV1(plano: string, hex: string): string {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), iv);
    const ct = Buffer.concat([c.update(plano, 'utf8'), c.final()]);
    return `enc:v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

/**
 * Corre el script de verdad (ts-node, como `npm run recifrar-secretos`), con el env del test.
 * Asíncrono a propósito: un spawnSync de un minuto congela el event loop y el keep-alive de
 * axios reusa después un socket que el server ya cerró (ECONNRESET en el request siguiente).
 */
function correrScript(...args: string[]): Promise<{ codigo: number | null; salida: string }> {
    return new Promise((resolve, reject) => {
        const hijo = spawn(process.execPath, [require.resolve('ts-node/dist/bin.js'), 'prisma/recifrar-secretos.ts', ...args], {
            cwd: BACK,
            env: process.env,
        });
        let salida = '';
        hijo.stdout.on('data', (d: Buffer) => { salida += d.toString('utf8'); });
        hijo.stderr.on('data', (d: Buffer) => { salida += d.toString('utf8'); });
        const corte = setTimeout(() => hijo.kill(), 180_000);
        hijo.on('error', reject);
        hijo.on('close', (codigo) => { clearTimeout(corte); resolve({ codigo, salida }); });
    });
}

describirConClave('Cifrado en reposo v2 y re-cifrado (APP-05)', () => {
    let pool: Pool;
    let adminToken: string;
    let integracionId: number;
    let otraId: number;
    const APP_SECRET = `app-secret-${crypto.randomBytes(8).toString('hex')}`;
    const PAGE_TOKEN = `EAAB-page-${crypto.randomBytes(8).toString('hex')}`;
    const OTRO_SECRET = `otro-secret-${crypto.randomBytes(8).toString('hex')}`;
    const kid = () => kidDeClave(CLAVE!);

    const leerConfig = async (id: number) =>
        (await pool.query(`SELECT config FROM integraciones_canal WHERE id = $1`, [id])).rows[0].config as Record<string, string>;
    const escribirConfig = (id: number, config: Record<string, unknown>) =>
        pool.query(`UPDATE integraciones_canal SET config = $1::jsonb WHERE id = $2`, [JSON.stringify(config), id]);

    const webhook = (id: number, secreto: string) => {
        const body = JSON.stringify({ object: 'page', entry: [] });
        const firma = 'sha256=' + crypto.createHmac('sha256', secreto).update(body).digest('hex');
        return api.post(`/api/webhooks/meta/${id}`, body, { headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': firma } });
    };

    /** Lo impreso no trae ningún secreto, ni la clave, ni partes de un blob. */
    const sinSecretos = (texto: string, blobs: string[]) => {
        for (const s of [APP_SECRET, PAGE_TOKEN, OTRO_SECRET, CLAVE!]) expect(texto).not.toContain(s);
        for (const b of blobs) for (const parte of b.split(':').slice(2)) if (parte.length >= 12) expect(texto).not.toContain(parte);
    };

    beforeAll(async () => {
        pool = new Pool({ connectionString: DB_URL!.replace('prisma+postgres://', 'postgres://'), max: 2 });
        adminToken = (await loginAsAdmin()).token;
        const crear = (appSecret: string) => api.post(
            '/api/integraciones',
            { tipo: 'meta', nombre: unique('MetaCifrado'), config: { origen: 'facebook', verifyToken: 'vt-prueba', appSecret, pageAccessToken: PAGE_TOKEN } },
            authHeaders(adminToken),
        );
        const a = await crear(APP_SECRET);
        expect(a.status).toBe(201);
        integracionId = a.data.id;
        const b = await crear(OTRO_SECRET);
        expect(b.status).toBe(201);
        otraId = b.data.id;
    });

    afterAll(async () => {
        for (const id of [integracionId, otraId]) if (id) await api.delete(`/api/integraciones/${id}`, authHeaders(adminToken));
        await pool?.end();
    });

    test('el alta guarda los secretos en v2 con la clave actual, atados a SU integración', async () => {
        const config = await leerConfig(integracionId);
        expect(inspeccionarSecreto(config.appSecret)).toEqual({ version: 'v2', kid: kid(), vigente: true });
        expect(inspeccionarSecreto(config.pageAccessToken)).toEqual({ version: 'v2', kid: kid(), vigente: true });
        expect(descifrarSecreto(config.appSecret, contextoSecreto.integracion(integracionId, 'appSecret'))).toBe(APP_SECRET);
        expect(() => descifrarSecreto(config.appSecret, contextoSecreto.integracion(otraId, 'appSecret'))).toThrow();
        // La API sigue sin devolverlos.
        const r = await api.get('/api/integraciones', authHeaders(adminToken));
        expect(JSON.stringify(r.data)).not.toContain(config.appSecret);
        expect(JSON.stringify(r.data)).not.toContain(APP_SECRET);
    });

    test('el server descifra en el camino de lectura: la firma del webhook valida con el appSecret', async () => {
        expect((await webhook(integracionId, APP_SECRET)).status).toBe(200);
        expect((await webhook(integracionId, 'otro')).status).toBe(403);
    });

    test('un appSecret movido a la fila de otra integración NO descifra: falla cerrado', async () => {
        const original = await leerConfig(otraId);
        const ajena = await leerConfig(integracionId);
        try {
            await escribirConfig(otraId, { ...original, appSecret: ajena.appSecret });
            // Con v1 esto validaba con el secreto AJENO (200). Ahora el AAD no cierra.
            expect((await webhook(otraId, APP_SECRET)).status).toBe(500);
        } finally {
            await escribirConfig(otraId, original);
        }
        expect((await webhook(otraId, OTRO_SECRET)).status).toBe(200);
    });

    test('la API no acepta un blob cifrado como secreto (no se puede "lavar" uno ajeno)', async () => {
        const ajena = await leerConfig(integracionId);
        const r = await api.patch(`/api/integraciones/${otraId}`, { config: { appSecret: ajena.appSecret } }, authHeaders(adminToken));
        expect(r.status).toBe(400);
    });

    test('lo legado (v1 y en claro) se lee; el script lo lista sin imprimir secretos y con --apply lo pasa a v2', async () => {
        const v1 = sobreV1(APP_SECRET, CLAVE!);
        const original = await leerConfig(integracionId);
        await escribirConfig(integracionId, { ...original, appSecret: v1, pageAccessToken: PAGE_TOKEN });
        // Compatibilidad: el server lee el v1 y NO lo reescribe en la lectura.
        expect((await webhook(integracionId, APP_SECRET)).status).toBe(200);
        expect((await leerConfig(integracionId)).appSecret).toBe(v1);

        const sim = await correrScript();
        expect(sim.salida).toContain('SIMULACIÓN');
        expect(sim.salida).toContain(`clave actual: ${kid()}`);
        expect(sim.salida).toMatch(/integraciones_canal\.config\.appSecret: \d+ \(.*v1 \(sin AAD\): [1-9]/);
        expect(sim.salida).toMatch(/integraciones_canal\.config\.pageAccessToken: \d+ \(.*en claro \(legado\): [1-9]/);
        sinSecretos(sim.salida, [v1, original.appSecret, original.pageAccessToken]);
        expect(sim.codigo).toBe(0);
        // La simulación no tocó nada.
        expect((await leerConfig(integracionId)).appSecret).toBe(v1);

        const aplicado = await correrScript('--apply');
        expect(aplicado.salida).toContain('APLICANDO');
        expect(aplicado.salida).toContain(`verificado: todo está en v2 con la clave ${kid()}`);
        sinSecretos(aplicado.salida, [v1, original.appSecret, original.pageAccessToken]);
        expect(aplicado.codigo).toBe(0);

        const despues = await leerConfig(integracionId);
        expect(inspeccionarSecreto(despues.appSecret)).toEqual({ version: 'v2', kid: kid(), vigente: true });
        expect(descifrarSecreto(despues.pageAccessToken, contextoSecreto.integracion(integracionId, 'pageAccessToken'))).toBe(PAGE_TOKEN);
        expect((await webhook(integracionId, APP_SECRET)).status).toBe(200);

        // Constancia de plataforma, sin valores.
        const ev = await pool.query(`SELECT detalle FROM security_events WHERE accion = 'recifrado_secretos' ORDER BY id DESC LIMIT 1`);
        expect(ev.rows[0].detalle).toContain(kid());
        sinSecretos(ev.rows[0].detalle, [v1, despues.appSecret]);

        // Idempotente: otra pasada no tiene nada que hacer.
        const otra = await correrScript('--apply');
        expect(otra.salida).toContain('a re-cifrar a v2 con la clave actual: 0');
        expect(otra.codigo).toBe(0);
    }, 600_000);

    test('un argumento mal escrito aborta sin tocar nada', async () => {
        const r = await correrScript('--aply');
        expect(r.codigo).toBe(1);
        expect(r.salida).toContain('argumento desconocido');
    }, 180_000);
});
