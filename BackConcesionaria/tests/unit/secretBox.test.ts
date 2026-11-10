// Unit tests (sin DB): cifrado en reposo v2 (AAD + kid + rotación) y compatibilidad con v1 y
// el texto plano legado. Las claves son de PRUEBA (fijas, sólo para este archivo).
import crypto from 'crypto';

const envMock: { INTEGRACIONES_SECRET_KEY?: string; INTEGRACIONES_SECRET_KEYS_ANTERIORES: string[] } = {
    INTEGRACIONES_SECRET_KEYS_ANTERIORES: [],
};
jest.mock('../../src/config/env', () => ({ env: envMock }));

import {
    SecretoIlegibleError,
    cifrarConfig,
    cifrarSecreto,
    configSinSecretos,
    contextoSecreto,
    descifrarSecreto,
    estaCifrado,
    inspeccionarSecreto,
    kidDeClave,
    kidsDeClaves,
    necesitaRecifrado,
} from '../../src/infrastructure/security/secretBox';

const CLAVE_A = '1f'.repeat(32);
const CLAVE_B = 'c4'.repeat(32);
const CLAVE_C = '7a'.repeat(32);

const usar = (actual?: string, anteriores: string[] = []) => {
    envMock.INTEGRACIONES_SECRET_KEY = actual;
    envMock.INTEGRACIONES_SECRET_KEYS_ANTERIORES = anteriores;
};

/** Un v1 tal como lo escribía el código anterior (sin AAD ni kid). */
function sobreV1(plano: string, hex: string): string {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), iv);
    const ct = Buffer.concat([c.update(plano, 'utf8'), c.final()]);
    return `enc:v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

const TOTP_7 = contextoSecreto.totpUsuario(7);
const TOTP_8 = contextoSecreto.totpUsuario(8);

beforeEach(() => usar(CLAVE_A));

describe('formato v2', () => {
    test('ida y vuelta: sale enc:v2:<kid>:… y descifra en el mismo contexto', () => {
        const blob = cifrarSecreto('JBSWY3DPEHPK3PXP', TOTP_7);
        expect(blob).toMatch(/^enc:v2:[0-9a-f]{8}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
        expect(descifrarSecreto(blob, TOTP_7)).toBe('JBSWY3DPEHPK3PXP');
    });

    test('el kid son los primeros 8 hex del SHA-256 de la clave, y la clave no aparece en el blob', () => {
        const esperado = crypto.createHash('sha256').update(Buffer.from(CLAVE_A, 'hex')).digest('hex').slice(0, 8);
        expect(kidDeClave(CLAVE_A)).toBe(esperado);
        const blob = cifrarSecreto('token-de-prueba', TOTP_7);
        expect(blob.split(':')[2]).toBe(esperado);
        expect(blob).not.toContain(CLAVE_A);
        expect(blob).not.toContain(CLAVE_A.slice(0, 8));
        expect(inspeccionarSecreto(blob)).toEqual({ version: 'v2', kid: esperado, vigente: true });
    });

    test('IV aleatorio: cifrar dos veces lo mismo da blobs distintos', () => {
        expect(cifrarSecreto('igual', TOTP_7)).not.toBe(cifrarSecreto('igual', TOTP_7));
    });

    test('AAD: copiado a otra fila, a otro campo o a otra tabla NO descifra (falla cerrado)', () => {
        const blob = cifrarSecreto('secreto-del-usuario-7', TOTP_7);
        const otros = [
            TOTP_8,
            contextoSecreto.integracion(7, 'appSecret'),
            contextoSecreto.cuentaMl(7, 'access_token'),
        ];
        for (const ctx of otros) {
            expect(() => descifrarSecreto(blob, ctx)).toThrow(SecretoIlegibleError);
        }
        try {
            descifrarSecreto(blob, TOTP_8);
        } catch (e) {
            expect((e as SecretoIlegibleError).motivo).toBe('no_autentica');
            // El mensaje identifica el lugar, nunca el valor.
            expect((e as Error).message).toContain('usuarios:8:totp_secret');
            expect((e as Error).message).not.toContain('secreto-del-usuario-7');
        }
    });

    test('dentro de una integración, cada campo tiene su contexto (el appSecret no va en el lugar del token)', () => {
        const config = cifrarConfig({ origen: 'facebook', appSecret: 'app-s', pageAccessToken: 'page-t' }, 5);
        expect(descifrarSecreto(config.appSecret as string, contextoSecreto.integracion(5, 'appSecret'))).toBe('app-s');
        expect(() => descifrarSecreto(config.appSecret as string, contextoSecreto.integracion(5, 'pageAccessToken'))).toThrow(SecretoIlegibleError);
        expect(() => descifrarSecreto(config.pageAccessToken as string, contextoSecreto.integracion(6, 'pageAccessToken'))).toThrow(SecretoIlegibleError);
        expect(config.origen).toBe('facebook');
    });

    test('un blob manipulado (ciphertext, tag truncado, kid alterado, partes de más) no descifra', () => {
        const blob = cifrarSecreto('original', TOTP_7);
        const [enc, v, kid, iv, tag, ct] = blob.split(':');
        const otroCt = Buffer.from(ct, 'base64');
        otroCt[0] ^= 0xff;
        const casos = [
            [enc, v, kid, iv, tag, otroCt.toString('base64')].join(':'),
            [enc, v, kid, iv, Buffer.from(tag, 'base64').subarray(0, 4).toString('base64'), ct].join(':'),
            [enc, v, '00000000', iv, tag, ct].join(':'),
            [enc, v, kid, iv, tag, ct, 'extra'].join(':'),
            [enc, v, kid, iv, tag].join(':'),
            [enc, v, kid, '%%%', tag, ct].join(':'),
        ];
        for (const c of casos) expect(() => descifrarSecreto(c, TOTP_7)).toThrow(SecretoIlegibleError);
    });

    test('una versión que este código no conoce es ilegible, NUNCA texto plano', () => {
        expect(estaCifrado('enc:v9:abc')).toBe(true);
        expect(() => descifrarSecreto('enc:v9:abc', TOTP_7)).toThrow(SecretoIlegibleError);
    });

    test('el contexto exige un id entero positivo', () => {
        for (const id of [0, -1, NaN, 1.5, undefined as unknown as number]) {
            expect(() => contextoSecreto.totpUsuario(id)).toThrow(/entero positivo/);
        }
    });
});

describe('rotación de clave', () => {
    test('con la clave anterior en ANTERIORES se sigue leyendo; se cifra con la nueva', () => {
        usar(CLAVE_A);
        const viejo = cifrarSecreto('token-viejo', TOTP_7);

        usar(CLAVE_B, [CLAVE_A]);
        expect(descifrarSecreto(viejo, TOTP_7)).toBe('token-viejo');
        expect(inspeccionarSecreto(viejo)).toEqual({ version: 'v2', kid: kidDeClave(CLAVE_A), vigente: false });
        expect(necesitaRecifrado(viejo)).toBe(true);

        const nuevo = cifrarSecreto('token-nuevo', TOTP_7);
        expect(inspeccionarSecreto(nuevo)).toEqual({ version: 'v2', kid: kidDeClave(CLAVE_B), vigente: true });
        expect(kidsDeClaves()).toEqual({ actual: kidDeClave(CLAVE_B), anteriores: [kidDeClave(CLAVE_A)] });
    });

    test('sin la clave vieja configurada, un v2 suyo falla con el kid que falta', () => {
        usar(CLAVE_A);
        const viejo = cifrarSecreto('token-viejo', TOTP_7);
        usar(CLAVE_B, [CLAVE_C]);
        try {
            descifrarSecreto(viejo, TOTP_7);
            throw new Error('tenía que fallar');
        } catch (e) {
            expect(e).toBeInstanceOf(SecretoIlegibleError);
            expect((e as SecretoIlegibleError).motivo).toBe('kid_desconocido');
            expect((e as Error).message).toContain(kidDeClave(CLAVE_A));
        }
    });

    test('re-guardar un sobre viejo (cifrarSecreto) lo pasa a v2 con la clave actual', () => {
        usar(CLAVE_A);
        const v2Viejo = cifrarSecreto('s1', TOTP_7);
        const v1 = sobreV1('s2', CLAVE_A);
        usar(CLAVE_B, [CLAVE_A]);
        for (const [blob, plano] of [[v2Viejo, 's1'], [v1, 's2']] as const) {
            const al = cifrarSecreto(blob, TOTP_7);
            expect(inspeccionarSecreto(al)).toEqual({ version: 'v2', kid: kidDeClave(CLAVE_B), vigente: true });
            expect(descifrarSecreto(al, TOTP_7)).toBe(plano);
        }
    });

    test('un v2 al día se deja igual al re-guardar (idempotente), pero sólo si es de ESTE contexto', () => {
        const blob = cifrarSecreto('s', TOTP_7);
        expect(cifrarSecreto(blob, TOTP_7)).toBe(blob);
        // Traído de otra fila: no se "lava" como propio.
        expect(() => cifrarSecreto(blob, TOTP_8)).toThrow(SecretoIlegibleError);
    });

    test('la actual repetida en ANTERIORES no rompe ni se lista dos veces', () => {
        usar(CLAVE_A, [CLAVE_A, CLAVE_B]);
        expect(kidsDeClaves()).toEqual({ actual: kidDeClave(CLAVE_A), anteriores: [kidDeClave(CLAVE_B)] });
    });
});

describe('compatibilidad: v1 y texto plano legado', () => {
    test('un v1 (sin AAD) se lee con la clave actual', () => {
        const v1 = sobreV1('pass-imap', CLAVE_A);
        expect(inspeccionarSecreto(v1)).toEqual({ version: 'v1' });
        expect(descifrarSecreto(v1, contextoSecreto.integracion(3, 'pass'))).toBe('pass-imap');
        expect(necesitaRecifrado(v1)).toBe(true);
    });

    test('un v1 de una clave anterior se lee probando el anillo', () => {
        const v1 = sobreV1('pass-imap', CLAVE_A);
        usar(CLAVE_B, [CLAVE_C, CLAVE_A]);
        expect(descifrarSecreto(v1, contextoSecreto.integracion(3, 'pass'))).toBe('pass-imap');
    });

    test('un v1 que no abre con ninguna clave falla cerrado', () => {
        const v1 = sobreV1('pass-imap', CLAVE_C);
        usar(CLAVE_A, [CLAVE_B]);
        expect(() => descifrarSecreto(v1, contextoSecreto.integracion(3, 'pass'))).toThrow(SecretoIlegibleError);
    });

    test('el texto plano legado pasa tal cual y se cifra al volver a guardarse', () => {
        expect(descifrarSecreto('token-en-claro', TOTP_7)).toBe('token-en-claro');
        expect(inspeccionarSecreto('token-en-claro')).toEqual({ version: 'claro' });
        expect(necesitaRecifrado('token-en-claro')).toBe(true);
        const blob = cifrarSecreto('token-en-claro', TOTP_7);
        expect(blob.startsWith('enc:v2:')).toBe(true);
    });

    test('vacío queda vacío', () => {
        expect(cifrarSecreto('', TOTP_7)).toBe('');
        expect(descifrarSecreto('', TOTP_7)).toBe('');
        expect(inspeccionarSecreto('')).toEqual({ version: 'vacio' });
        expect(necesitaRecifrado('')).toBe(false);
    });
});

describe('sin clave (sólo desarrollo/test)', () => {
    test('se guarda en claro y un sobre falla cerrado con el motivo', () => {
        usar(CLAVE_A);
        const blob = cifrarSecreto('s', TOTP_7);
        usar(undefined);
        expect(cifrarSecreto('nuevo', TOTP_7)).toBe('nuevo');
        try {
            descifrarSecreto(blob, TOTP_7);
            throw new Error('tenía que fallar');
        } catch (e) {
            expect((e as SecretoIlegibleError).motivo).toBe('sin_clave');
            expect((e as Error).message).toContain('INTEGRACIONES_SECRET_KEY');
        }
        expect(kidsDeClaves()).toEqual({ actual: null, anteriores: [] });
    });
});

describe('cifrarConfig / configSinSecretos', () => {
    test('cifra sólo los campos secretos; configSinSecretos los saca (alta en dos pasos)', () => {
        const config = { origen: 'deruedas', host: 'imap.example.com', user: 'u', pass: 'p' };
        const cifrada = cifrarConfig(config, 9);
        expect(cifrada.host).toBe('imap.example.com');
        expect(String(cifrada.pass).startsWith('enc:v2:')).toBe(true);
        expect(configSinSecretos(config)).toEqual({ origen: 'deruedas', host: 'imap.example.com', user: 'u' });
    });
});

describe('la API no acepta secretos con forma de sobre cifrado', () => {
    // Un blob sólo puede venir copiado de la base: aceptarlo dejaría "lavarlo" como propio de
    // otra integración al re-cifrar (un v1 no tiene AAD que lo impida).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const schemas = require('../../src/interface/validation/integracion.schema');
    const blob = sobreV1('token-ajeno', CLAVE_A);

    test('alta: un appSecret o una pass cifrados → 400 en el campo', () => {
        const meta = schemas.createIntegracionSchema.safeParse({
            tipo: 'meta', nombre: 'x', config: { origen: 'facebook', verifyToken: 'v', appSecret: blob, pageAccessToken: 'p' },
        });
        expect(meta.success).toBe(false);
        expect(meta.error.issues[0].path).toEqual(['config', 'appSecret']);
        const email = schemas.createIntegracionSchema.safeParse({
            tipo: 'email', nombre: 'x', config: { host: 'imap.example.com', user: 'u', pass: 'enc:v2:00000000:a:b:c' },
        });
        expect(email.success).toBe(false);
    });

    test('edición: lo entrante se valida; el valor en claro y el enmascarado pasan', () => {
        expect(schemas.updateMetaConfigSchema.safeParse({ pageAccessToken: blob }).success).toBe(false);
        expect(schemas.updateEmailConfigSchema.safeParse({ pass: blob }).success).toBe(false);
        expect(schemas.updateMetaConfigSchema.safeParse({ pageAccessToken: 'nuevo' }).success).toBe(true);
        expect(schemas.updateMetaConfigSchema.safeParse({ appSecret: '••••••••' }).success).toBe(true);
    });

    test('el schema completo (que revalida la config mergeada, con los guardados cifrados) los sigue aceptando', () => {
        expect(schemas.metaConfigSchema.safeParse({ origen: 'facebook', verifyToken: 'v', appSecret: blob, pageAccessToken: blob }).success).toBe(true);
    });
});
