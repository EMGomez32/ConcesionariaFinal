// Unit test PURO: el mail de recuperación sin SMTP no debe filtrar el token al log
// en producción (quien lea docker logs tomaría la cuenta) ni imprimir el email entero.
const warn = jest.fn();
jest.mock('../../src/infrastructure/logging/logger', () => ({
    logger: { warn: (...a: unknown[]) => warn(...a), error: jest.fn(), info: jest.fn() },
}));

const TOKEN = 'TOKEN_SECRETO_abc123';
const LINK = `https://autenza.example/reset-password?token=${TOKEN}`;

async function enviarSinSmtp(nodeEnv: 'production' | 'development') {
    jest.resetModules();
    warn.mockClear();
    jest.doMock('../../src/config/env', () => ({
        env: { NODE_ENV: nodeEnv, SMTP_HOST: '', SMTP_PORT: undefined, SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: '' },
    }));
    const { sendPasswordResetEmail } = await import('../../src/infrastructure/email/mailer');
    await sendPasswordResetEmail('usuario@demo.com', LINK);
    return warn.mock.calls.map((c) => String(c[0])).join('\n');
}

describe('mailer sin SMTP', () => {
    test('en PRODUCCIÓN no loguea el token ni el email completo', async () => {
        const log = await enviarSinSmtp('production');
        expect(log).toContain('SMTP no configurado');
        expect(log).not.toContain(TOKEN);
        expect(log).not.toContain('usuario@demo.com');
        expect(log).toContain('us***@demo.com');
    });

    test('fuera de producción sí muestra el link (para probar el flujo), con el email enmascarado', async () => {
        const log = await enviarSinSmtp('development');
        expect(log).toContain(TOKEN);
        expect(log).not.toContain('usuario@demo.com');
    });
});

describe('enmascararEmail', () => {
    test('deja sólo 2 caracteres del usuario y el dominio', async () => {
        jest.resetModules();
        jest.doMock('../../src/config/env', () => ({ env: { NODE_ENV: 'test', SMTP_HOST: '' } }));
        const { enmascararEmail } = await import('../../src/infrastructure/email/mailer');
        expect(enmascararEmail('maria.lopez@empresa.com')).toBe('ma***@empresa.com');
        expect(enmascararEmail('sin-arroba')).toBe('***');
    });
});
