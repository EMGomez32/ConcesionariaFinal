// Unit tests (sin DB): el re-cifrado clasifica bien por versión/kid, pasa todo a v2 con la
// clave actual sin pisar escrituras concurrentes, es idempotente y NUNCA deja un valor (ni en
// claro ni cifrado) en lo que se imprime. La base es un doble en memoria; claves de PRUEBA.
import crypto from 'crypto';

const envMock: { INTEGRACIONES_SECRET_KEY?: string; INTEGRACIONES_SECRET_KEYS_ANTERIORES: string[] } = {
    INTEGRACIONES_SECRET_KEYS_ANTERIORES: [],
};
jest.mock('../../src/config/env', () => ({ env: envMock }));

import { cifrarSecreto, contextoSecreto, descifrarSecreto, inspeccionarSecreto, kidDeClave } from '../../src/infrastructure/security/secretBox';
import {
    aplicarRecifrado,
    motivoSeguro,
    planificarRecifrado,
    resumirPlan,
} from '../../src/infrastructure/security/recifradoSecretos';

const VIEJA = '3b'.repeat(32);
const NUEVA = 'e9'.repeat(32);
const PERDIDA = '55'.repeat(32);

function sobreV1(plano: string, hex: string): string {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), iv);
    const ct = Buffer.concat([c.update(plano, 'utf8'), c.final()]);
    return `enc:v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

// Secretos en claro de la base de prueba: ninguno puede aparecer en lo impreso.
const PLANOS = {
    totp1: 'TOTPPLANOUNO2345',
    totp2: 'TOTPPLANODOS2345',
    totp3: 'TOTPPLANOTRES345',
    app: 'app-secret-plano',
    page: 'page-token-plano',
    pass: 'pass-imap-plana',
    access: 'APP_USR-access-plano',
    refresh: 'TG-refresh-plano',
    perdido: 'cifrado-con-clave-perdida',
};

interface Base {
    usuarios: { id: number; totpSecret: string | null; updatedAt: Date }[];
    integraciones: { id: number; config: Record<string, unknown>; updatedAt: Date }[];
    cuentas: { id: number; accessToken: string; refreshToken: string; updatedAt: Date; modo: 'real' | 'demo' }[];
    eventos: { accion: string; detalle: string }[];
}

const AYER = new Date('2026-11-09T12:00:00Z');

/** Base "vieja": todo cifrado con VIEJA (v2 y v1), un texto plano y uno de una clave perdida. */
function armarBase(): Base {
    envMock.INTEGRACIONES_SECRET_KEY = VIEJA;
    envMock.INTEGRACIONES_SECRET_KEYS_ANTERIORES = [];
    const base: Base = {
        usuarios: [
            { id: 1, totpSecret: cifrarSecreto(PLANOS.totp1, contextoSecreto.totpUsuario(1)), updatedAt: AYER },
            { id: 2, totpSecret: sobreV1(PLANOS.totp2, VIEJA), updatedAt: AYER },
            { id: 3, totpSecret: PLANOS.totp3, updatedAt: AYER },
            { id: 4, totpSecret: null, updatedAt: AYER },
        ],
        integraciones: [
            {
                id: 10,
                config: {
                    origen: 'facebook',
                    verifyToken: 'no-es-secreto',
                    appSecret: cifrarSecreto(PLANOS.app, contextoSecreto.integracion(10, 'appSecret')),
                    pageAccessToken: sobreV1(PLANOS.page, VIEJA),
                },
                updatedAt: AYER,
            },
            { id: 11, config: { origen: 'deruedas', host: 'imap.example.com', pass: PLANOS.pass }, updatedAt: AYER },
            { id: 12, config: { origen: 'instagram' }, updatedAt: AYER },
        ],
        cuentas: [
            {
                id: 20,
                accessToken: cifrarSecreto(PLANOS.access, contextoSecreto.cuentaMl(20, 'access_token')),
                refreshToken: cifrarSecreto(PLANOS.refresh, contextoSecreto.cuentaMl(20, 'refresh_token')),
                updatedAt: AYER,
                modo: 'real',
            },
            { id: 21, accessToken: '', refreshToken: '', updatedAt: AYER, modo: 'real' },
            { id: 22, accessToken: 'demo:sin-token', refreshToken: 'demo:sin-token', updatedAt: AYER, modo: 'demo' },
        ],
        eventos: [],
    };
    // Uno cifrado con una clave que ya nadie tiene: tiene que quedar ilegible y sin tocar.
    envMock.INTEGRACIONES_SECRET_KEY = PERDIDA;
    base.usuarios.push({ id: 5, totpSecret: cifrarSecreto(PLANOS.perdido, contextoSecreto.totpUsuario(5)), updatedAt: AYER });
    return base;
}

const coincide = (fila: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
        if (v && typeof v === 'object' && 'equals' in (v as object)) return JSON.stringify(fila[k]) === JSON.stringify((v as { equals: unknown }).equals);
        if (v && typeof v === 'object' && 'not' in (v as object)) return fila[k] !== (v as { not: unknown }).not;
        return fila[k] === v;
    });

/** Doble de PrismaClient con lo justo que usa el re-cifrado. */
function dobleDb(base: Base, antesDeEscribir?: () => void) {
    const tabla = (filas: Record<string, unknown>[]) => ({
        findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
            filas.filter((f) => !where || coincide(f, where)).map((f) => ({ ...f }))),
        updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
            antesDeEscribir?.();
            const afectadas = filas.filter((f) => coincide(f, where));
            for (const f of afectadas) Object.assign(f, data);
            return { count: afectadas.length };
        }),
    });
    return {
        usuario: tabla(base.usuarios as never),
        integracionCanal: tabla(base.integraciones as never),
        mercadoLibreCuenta: tabla(base.cuentas as never),
        securityEvent: { create: jest.fn(async ({ data }: { data: { accion: string; detalle: string } }) => { base.eventos.push(data); }) },
    } as never;
}

/** Nada de lo que se imprime o se guarda como constancia puede traer un valor. */
function sinValores(texto: string, base: Base) {
    for (const p of Object.values(PLANOS)) expect(texto).not.toContain(p);
    for (const k of [VIEJA, NUEVA, PERDIDA]) expect(texto).not.toContain(k);
    const blobs = [
        ...base.usuarios.map((u) => u.totpSecret),
        ...base.integraciones.flatMap((i) => Object.values(i.config)),
        ...base.cuentas.flatMap((c) => [c.accessToken, c.refreshToken]),
    ].filter((v): v is string => typeof v === 'string' && v.startsWith('enc:'));
    for (const b of blobs) {
        // Ni el blob entero ni sus partes binarias (iv, tag, ct).
        for (const parte of b.split(':').slice(3)) if (parte.length >= 8) expect(texto).not.toContain(parte);
    }
}

describe('re-cifrado de secretos (rotación VIEJA → NUEVA)', () => {
    let base: Base;

    beforeEach(() => {
        base = armarBase();
        envMock.INTEGRACIONES_SECRET_KEY = NUEVA;
        envMock.INTEGRACIONES_SECRET_KEYS_ANTERIORES = [VIEJA];
    });

    test('la simulación cuenta por lugar y versión/kid, marca los ilegibles y no escribe', async () => {
        const db = dobleDb(base);
        const plan = await planificarRecifrado(db);
        const lineas = resumirPlan(plan);
        const texto = lineas.join('\n');

        expect(plan.kids).toEqual({ actual: kidDeClave(NUEVA), anteriores: [kidDeClave(VIEJA)] });
        expect(texto).toContain('usuarios.totp_secret: 4');
        expect(texto).toContain(`v2 clave anterior (${kidDeClave(VIEJA)}): 1`);
        expect(texto).toContain('v1 (sin AAD): 1');
        expect(texto).toContain('en claro (legado): 1');
        expect(texto).toContain('integraciones_canal.config.appSecret: 1');
        expect(texto).toContain('integraciones_canal.config.pass: 1');
        expect(texto).toContain('mercadolibre_cuentas.access_token: 1');
        expect(texto).toContain('modo demostración salteadas (no tienen tokens reales): 1');
        // 3 totp + appSecret + pageAccessToken + pass + 2 de ML; el de la clave perdida no.
        expect(texto).toContain('a re-cifrar a v2 con la clave actual: 8');
        expect(texto).toContain('ilegibles: 1');
        expect(texto).toContain(`usuarios:5:totp_secret (clave ${kidDeClave(PERDIDA)}): kid_desconocido`);
        expect((db as any).usuario.updateMany).not.toHaveBeenCalled();
        sinValores(texto, base);
    });

    test('--apply pasa todo lo legible a v2 con la clave nueva, conserva updatedAt y deja constancia sin valores', async () => {
        const db = dobleDb(base);
        const r = await aplicarRecifrado(db, await planificarRecifrado(db));
        expect(r).toEqual({ recifrados: 8, cambiaronDuranteLaCorrida: 0, errores: [] });

        const vigente = { version: 'v2', kid: kidDeClave(NUEVA), vigente: true };
        const [u1, u2, u3, , u5] = base.usuarios;
        expect(inspeccionarSecreto(u1.totpSecret)).toEqual(vigente);
        expect(inspeccionarSecreto(u2.totpSecret)).toEqual(vigente);
        expect(inspeccionarSecreto(u3.totpSecret)).toEqual(vigente);
        expect(descifrarSecreto(u2.totpSecret!, contextoSecreto.totpUsuario(2))).toBe(PLANOS.totp2);
        expect(descifrarSecreto(u3.totpSecret!, contextoSecreto.totpUsuario(3))).toBe(PLANOS.totp3);
        expect(inspeccionarSecreto(u5.totpSecret)).toEqual({ version: 'v2', kid: kidDeClave(PERDIDA), vigente: false });
        expect(u1.updatedAt).toBe(AYER);

        const meta = base.integraciones[0].config;
        expect(descifrarSecreto(meta.appSecret as string, contextoSecreto.integracion(10, 'appSecret'))).toBe(PLANOS.app);
        expect(descifrarSecreto(meta.pageAccessToken as string, contextoSecreto.integracion(10, 'pageAccessToken'))).toBe(PLANOS.page);
        expect(meta.verifyToken).toBe('no-es-secreto');
        expect(descifrarSecreto(base.integraciones[1].config.pass as string, contextoSecreto.integracion(11, 'pass'))).toBe(PLANOS.pass);

        const [ml, vacia, demo] = base.cuentas;
        expect(descifrarSecreto(ml.accessToken, contextoSecreto.cuentaMl(20, 'access_token'))).toBe(PLANOS.access);
        expect(descifrarSecreto(ml.refreshToken, contextoSecreto.cuentaMl(20, 'refresh_token'))).toBe(PLANOS.refresh);
        expect(vacia.accessToken).toBe('');
        expect(demo.accessToken).toBe('demo:sin-token');

        expect(base.eventos).toHaveLength(1);
        expect(base.eventos[0].accion).toBe('recifrado_secretos');
        expect(base.eventos[0].detalle).toContain(kidDeClave(NUEVA));
        sinValores(base.eventos[0].detalle, base);
    });

    test('es idempotente: la segunda corrida no tiene nada que hacer y ya no hace falta la clave vieja', async () => {
        const db = dobleDb(base);
        await aplicarRecifrado(db, await planificarRecifrado(db));
        envMock.INTEGRACIONES_SECRET_KEYS_ANTERIORES = [];
        const segunda = await planificarRecifrado(db);
        expect(segunda.items.filter((i) => i.recifrar)).toHaveLength(0);
        // Sólo queda el de la clave perdida, que ya era ilegible.
        expect(segunda.items.filter((i) => i.ilegible).map((i) => i.contexto)).toEqual(['usuarios:5:totp_secret']);
        const r = await aplicarRecifrado(db, segunda);
        expect(r.recifrados).toBe(0);
    });

    test('si la app cambió la fila mientras corría, no se pisa: se cuenta aparte', async () => {
        let renovado = false;
        const db = dobleDb(base, () => {
            if (renovado) return;
            renovado = true;
            // En el medio de la corrida, el usuario 2 volvió a configurar su 2FA desde la app.
            base.usuarios[1].totpSecret = cifrarSecreto('otro-secreto', contextoSecreto.totpUsuario(2));
        });
        const r = await aplicarRecifrado(db, await planificarRecifrado(db));
        expect(r.cambiaronDuranteLaCorrida).toBe(1);
        expect(r.recifrados).toBe(7);
        expect(descifrarSecreto(base.usuarios[1].totpSecret!, contextoSecreto.totpUsuario(2))).toBe('otro-secreto');
    });

    test('un blob movido de fila queda ilegible (AAD) y no se re-cifra como propio', async () => {
        base.usuarios[2].totpSecret = base.usuarios[0].totpSecret; // el de usuario 1, pegado en el 3
        const db = dobleDb(base);
        const plan = await planificarRecifrado(db);
        const movido = plan.items.find((i) => i.contexto === 'usuarios:3:totp_secret')!;
        expect(movido.ilegible).toBe('no_autentica');
        expect(movido.recifrar).toBe(false);
        sinValores(resumirPlan(plan).join('\n'), base);
    });

    test('los errores de base se reportan sin el mensaje crudo (que puede traer los argumentos)', async () => {
        const db = dobleDb(base) as any;
        db.usuario.updateMany.mockRejectedValue(Object.assign(new Error(`Invalid invocation: data: { totpSecret: "${PLANOS.totp1}" }`), { name: 'PrismaClientValidationError' }));
        const r = await aplicarRecifrado(db, await planificarRecifrado(db));
        expect(r.errores).toHaveLength(3);
        const texto = r.errores.join('\n');
        expect(texto).toContain('PrismaClientValidationError');
        sinValores(texto, base);
    });

    test('motivoSeguro: código de Prisma sí, mensaje no', () => {
        const e = Object.assign(new Error(`falló con ${PLANOS.access}`), { name: 'PrismaClientKnownRequestError', code: 'P2002' });
        expect(motivoSeguro(e)).toBe('PrismaClientKnownRequestError (P2002)');
    });
});
