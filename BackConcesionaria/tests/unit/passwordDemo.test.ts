// Unit test (sin DB): la contraseña de las cuentas demo de seed-demo.ts.
import { PASSWORD_DEMO_POR_DEFECTO, resolverPasswordDemo } from '../../prisma/passwordDemo';

describe('resolverPasswordDemo', () => {
    test('fuera de producción: usa SEED_DEMO_PASSWORD o, si no está, la de siempre', () => {
        expect(resolverPasswordDemo('development', undefined)).toBe(PASSWORD_DEMO_POR_DEFECTO);
        expect(resolverPasswordDemo('test', '')).toBe(PASSWORD_DEMO_POR_DEFECTO);
        expect(resolverPasswordDemo('development', 'otra-clave-local')).toBe('otra-clave-local');
    });

    test('en producción sin SEED_DEMO_PASSWORD (o con la del repo) aborta', () => {
        expect(() => resolverPasswordDemo('production', undefined)).toThrow(/SEED_DEMO_PASSWORD/);
        expect(() => resolverPasswordDemo('production', PASSWORD_DEMO_POR_DEFECTO)).toThrow(/publicada/);
    });

    test.each(['corta123', 'password123', 'ñ'.repeat(40)])('en producción una contraseña débil (%s) aborta', (p) => {
        expect(() => resolverPasswordDemo('production', p)).toThrow(/débil/);
    });

    test('en producción una contraseña fuerte pasa', () => {
        expect(resolverPasswordDemo('production', 'demo-de-feria-2026-x')).toBe('demo-de-feria-2026-x');
    });
});
