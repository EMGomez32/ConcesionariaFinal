// Unit tests (sin DB): el arranque exige el rol app_rw en producción y NODE_ENV cae a
// "production" si no se define. env.ts valida process.env al importarse y hace process.exit(1)
// si es inválido, así que cada caso lo importa aislado con un env controlado.
jest.mock('dotenv', () => ({ config: jest.fn() }));

const BASE: Record<string, string> = {
    DATABASE_URL: 'postgresql://postgres:admin@db:5432/concesionaria',
    JWT_SECRET: 'un-secreto-largo-y-distinto-para-jwt-123456',
    JWT_REFRESH_SECRET: 'otro-secreto-largo-y-distinto-para-refresh-654321',
};
const APP_ROL = {
    APP_DATABASE_URL: 'postgresql://app_rw:clave@db:5432/concesionaria',
    APP_DB_PASSWORD: 'clave',
};

function cargarEnv(vars: Record<string, string | undefined>) {
    const original = { ...process.env };
    // Entorno limpio: sólo lo que el caso define.
    for (const k of Object.keys(process.env)) delete process.env[k];
    for (const [k, v] of Object.entries({ ...BASE, ...vars })) if (v !== undefined) process.env[k] = v;

    const salidas: number[] = [];
    const errores: string[] = [];
    const exit = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => { salidas.push(code ?? 0); throw new Error('exit'); }) as never);
    const err = jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errores.push(JSON.stringify(a)); });
    let env: any = null;
    try {
        jest.isolateModules(() => { env = require('../../src/config/env').env; });
    } catch { /* process.exit simulado */ }
    exit.mockRestore();
    err.mockRestore();
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, original);
    return { env, salidas, errores: errores.join(' ') };
}

describe('NODE_ENV', () => {
    test('sin NODE_ENV el default es production (default seguro)', () => {
        const r = cargarEnv({ ...APP_ROL });
        expect(r.salidas).toEqual([]);
        expect(r.env.NODE_ENV).toBe('production');
    });

    test('development y test se respetan cuando se piden explícito', () => {
        expect(cargarEnv({ NODE_ENV: 'development' }).env.NODE_ENV).toBe('development');
        expect(cargarEnv({ NODE_ENV: 'test' }).env.NODE_ENV).toBe('test');
    });
});

describe('rol app_rw obligatorio en producción', () => {
    test('producción SIN APP_DATABASE_URL → el arranque falla con el motivo', () => {
        const r = cargarEnv({ NODE_ENV: 'production' });
        expect(r.salidas).toEqual([1]);
        expect(r.errores).toContain('APP_DATABASE_URL');
        expect(r.errores).toContain('superusuario');
    });

    test('sin NODE_ENV (= producción) y sin APP_DATABASE_URL también falla', () => {
        expect(cargarEnv({}).salidas).toEqual([1]);
    });

    test('producción con APP_DATABASE_URL + APP_DB_PASSWORD arranca', () => {
        const r = cargarEnv({ NODE_ENV: 'production', ...APP_ROL });
        expect(r.salidas).toEqual([]);
        expect(r.env.APP_DATABASE_URL).toContain('app_rw');
    });

    test('APP_DATABASE_URL vacía cuenta como no seteada', () => {
        expect(cargarEnv({ NODE_ENV: 'production', APP_DATABASE_URL: '', APP_DB_PASSWORD: '' }).salidas).toEqual([1]);
    });

    test('la válvula de emergencia ALLOW_SUPERUSER_DB=1 permite arrancar sin el rol', () => {
        const r = cargarEnv({ NODE_ENV: 'production', ALLOW_SUPERUSER_DB: '1' });
        expect(r.salidas).toEqual([]);
        expect(r.env.APP_DATABASE_URL).toBeUndefined();
    });

    test('ALLOW_SUPERUSER_DB=0 no habilita nada', () => {
        expect(cargarEnv({ NODE_ENV: 'production', ALLOW_SUPERUSER_DB: '0' }).salidas).toEqual([1]);
    });

    test('en desarrollo y en test NO se exige (el CI y el dev local corren sin el rol)', () => {
        expect(cargarEnv({ NODE_ENV: 'development' }).salidas).toEqual([]);
        expect(cargarEnv({ NODE_ENV: 'test' }).salidas).toEqual([]);
    });

    test('APP_DATABASE_URL sin APP_DB_PASSWORD sigue siendo inválido (ya lo era)', () => {
        expect(cargarEnv({ NODE_ENV: 'development', APP_DATABASE_URL: APP_ROL.APP_DATABASE_URL }).salidas).toEqual([1]);
    });
});
