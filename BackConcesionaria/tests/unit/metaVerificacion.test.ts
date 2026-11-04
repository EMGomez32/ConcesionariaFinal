// Unit test (sin DB): handshake del webhook de Meta. El verifyToken se compara en tiempo
// constante (secretosIguales) y sólo con hub.mode=subscribe.
jest.mock('../../src/config/env', () => ({ env: { NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(32) } }));
jest.mock('../../src/infrastructure/database/prisma', () => ({ __esModule: true, default: {}, rawPrisma: {} }));
jest.mock('../../src/infrastructure/database/unitOfWork', () => ({ withAuthBypass: jest.fn(), withTenantTransaction: jest.fn() }));
jest.mock('../../src/infrastructure/logging/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { resolverVerificacionMeta, secretosIguales } from '../../src/infrastructure/integraciones/metaWebhook';

const integracion = (verifyToken?: string) => ({ config: verifyToken ? { verifyToken } : {} }) as any;

describe('secretosIguales', () => {
    test.each([
        ['abc', 'abc', true],
        ['abc', 'abd', false],
        ['abc', 'abcd', false], // distinto largo: no tira (timingSafeEqual exige mismo largo) y da false
        ['', '', true],
        ['ñandú', 'ñandú', true],
    ])('%p vs %p → %p', (a, b, esperado) => {
        expect(secretosIguales(a, b)).toBe(esperado);
    });
});

describe('resolverVerificacionMeta', () => {
    const q = (token: unknown, mode = 'subscribe') => ({ 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': '12345' });

    test('token correcto + subscribe → devuelve el challenge', () => {
        expect(resolverVerificacionMeta(integracion('mi-token-secreto'), q('mi-token-secreto'))).toBe('12345');
    });

    test.each([
        ['token incorrecto', 'mi-token-secretX', 'subscribe', 'mi-token-secreto'],
        ['prefijo del token', 'mi-token', 'subscribe', 'mi-token-secreto'],
        ['otro modo', 'mi-token-secreto', 'unsubscribe', 'mi-token-secreto'],
        ['token no string', ['mi-token-secreto'], 'subscribe', 'mi-token-secreto'],
        ['integración sin token configurado', '', 'subscribe', undefined],
    ])('%s → null', (_caso, token, mode, configurado) => {
        expect(resolverVerificacionMeta(integracion(configurado as string | undefined), q(token, mode as string))).toBeNull();
    });

    test.each([
        ['markup', '<script>alert(1)</script>'],
        ['comillas', '"x"'],
        ['salto de línea', '123\n456'],
        ['vacío', ''],
        ['no string', ['123']],
        ['demasiado largo', '1'.repeat(257)],
    ])('token correcto pero challenge con %s → null (no se refleja)', (_caso, challenge) => {
        const query = { 'hub.mode': 'subscribe', 'hub.verify_token': 'mi-token-secreto', 'hub.challenge': challenge };
        expect(resolverVerificacionMeta(integracion('mi-token-secreto'), query)).toBeNull();
    });
});
