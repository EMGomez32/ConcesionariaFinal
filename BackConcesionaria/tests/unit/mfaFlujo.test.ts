// Unit tests (sin DB): política de 2FA obligatorio, token de login, sesión con mfaPending,
// bloqueo de sesiones pendientes y política de contraseñas nuevas.
const envMock: Record<string, unknown> = { NODE_ENV: 'test', JWT_SECRET: 'secreto-de-prueba-largo-1234567890' };
jest.mock('../../src/config/env', () => ({ env: envMock }));
jest.mock('../../src/config', () => ({ __esModule: true, default: { jwt: { refreshExpirationDays: '7' } } }));
jest.mock('../../src/infrastructure/database/prisma', () => ({ __esModule: true, default: {}, rawPrisma: { securityEvent: { create: jest.fn() }, passwordResetToken: {} } }));
jest.mock('../../src/infrastructure/logging/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import jwt from 'jsonwebtoken';
import { exigeMfa, mfaPendiente, rolesQueExigenMfa } from '../../src/infrastructure/security/mfaPolicy';
import { emitirMfaToken, usuarioDeMfaTokenSinVerificar, verificarMfaToken } from '../../src/infrastructure/security/mfaToken';
import { emitirSesion } from '../../src/application/use-cases/auth/emitirSesion';
import { authenticate } from '../../src/interface/middlewares/authenticate.middleware';
import { context } from '../../src/infrastructure/security/context';
import { clasificar } from '../../src/interface/middlewares/authEvents.middleware';
import { esContrasenaComun, passwordNueva } from '../../src/interface/validation/password';
import { createUsuarioSchema, changeMyPasswordSchema, resetUsuarioPasswordSchema } from '../../src/interface/validation/usuario.schema';
import { resetPasswordSchema, login2faSchema, mfaDisableSchema } from '../../src/interface/validation/auth.schema';

const original = process.env.MFA_REQUIRED_ROLES;
afterEach(() => {
    if (original === undefined) delete process.env.MFA_REQUIRED_ROLES; else process.env.MFA_REQUIRED_ROLES = original;
    envMock.NODE_ENV = 'test';
});

describe('rolesQueExigenMfa', () => {
    test('sin variable: en test y desarrollo nadie; en producción, super_admin', () => {
        delete process.env.MFA_REQUIRED_ROLES;
        envMock.NODE_ENV = 'test';
        expect(rolesQueExigenMfa()).toEqual([]);
        envMock.NODE_ENV = 'development';
        expect(rolesQueExigenMfa()).toEqual([]);
        envMock.NODE_ENV = 'production';
        expect(rolesQueExigenMfa()).toEqual(['super_admin']);
    });

    test('la variable manda sobre el default, con espacios y vacíos', () => {
        envMock.NODE_ENV = 'production';
        process.env.MFA_REQUIRED_ROLES = ' super_admin , admin,, ';
        expect(rolesQueExigenMfa()).toEqual(['super_admin', 'admin']);
    });

    test('MFA_REQUIRED_ROLES=none es el escape de emergencia: no se exige a nadie ni en producción', () => {
        envMock.NODE_ENV = 'production';
        process.env.MFA_REQUIRED_ROLES = 'none';
        expect(rolesQueExigenMfa()).toEqual([]);
        expect(exigeMfa(['super_admin'])).toBe(false);
        process.env.MFA_REQUIRED_ROLES = ' NONE ';
        expect(rolesQueExigenMfa()).toEqual([]);
    });

    test('variable VACÍA (así la pasa docker compose si no está definida) = el default, NO apaga la política', () => {
        envMock.NODE_ENV = 'production';
        process.env.MFA_REQUIRED_ROLES = '';
        expect(rolesQueExigenMfa()).toEqual(['super_admin']);
    });

    test('exigeMfa / mfaPendiente', () => {
        envMock.NODE_ENV = 'production';
        delete process.env.MFA_REQUIRED_ROLES;
        expect(exigeMfa(['super_admin'])).toBe(true);
        expect(exigeMfa(['admin'])).toBe(false);
        expect(exigeMfa(undefined)).toBe(false);
        expect(mfaPendiente(['super_admin'], false)).toBe(true);
        expect(mfaPendiente(['super_admin'], true)).toBe(false); // ya lo activó
        expect(mfaPendiente(['vendedor'], false)).toBe(false);
    });
});

describe('mfaToken (contraseña correcta, falta el segundo factor)', () => {
    test('ida y vuelta', () => {
        expect(verificarMfaToken(emitirMfaToken(42))).toBe(42);
    });

    test('NO sirve como access token (clave y propósito propios) ni al revés', () => {
        const t = emitirMfaToken(42);
        expect(() => jwt.verify(t, envMock.JWT_SECRET as string)).toThrow(); // firmado con clave derivada
        const accessFalso = jwt.sign({ userId: 42, purpose: 'mfa' }, envMock.JWT_SECRET as string);
        expect(verificarMfaToken(accessFalso)).toBeNull();
        const otroProposito = jwt.sign({ sub: '42', purpose: 'otro' }, 'x'.repeat(32));
        expect(verificarMfaToken(otroProposito)).toBeNull();
    });

    test('vencido o manipulado → null', () => {
        const t = emitirMfaToken(7);
        expect(verificarMfaToken(`${t.slice(0, -2)}xx`)).toBeNull();
        const vencido = (jwt.decode(t) as any);
        expect(vencido.exp - vencido.iat).toBe(300); // 5 minutos
    });

    test.each([[undefined], [null], [''], [123], ['no.es.jwt'], ['a.b']])('entrada inválida %p → null', (x) => {
        expect(verificarMfaToken(x)).toBeNull();
    });

    test('usuarioDeMfaTokenSinVerificar sólo agrupa el rate limit', () => {
        expect(usuarioDeMfaTokenSinVerificar(emitirMfaToken(9))).toBe(9);
        expect(usuarioDeMfaTokenSinVerificar('basura')).toBeNull();
        expect(usuarioDeMfaTokenSinVerificar(undefined)).toBeNull();
    });
});

describe('emitirSesion (mfaPending lo decide la base, no el cliente)', () => {
    const tokenService: any = {
        generateAccessToken: jest.fn((p: any) => `access:${JSON.stringify(p)}`),
        generateRefreshToken: jest.fn(() => 'refresh'),
        hashToken: (t: string) => `h(${t})`,
    };
    const repo: any = { create: jest.fn().mockResolvedValue({}) };
    const usuario = (roles: string[], totpEnabled: boolean) => ({
        id: 1, nombre: 'N', email: 'e@x.com', concesionariaId: null, sucursalId: null, totpEnabled,
        roles: roles.map((nombre) => ({ deletedAt: null, rol: { nombre, deletedAt: null } })),
    });

    test('super_admin sin 2FA en producción → sesión con mfaPending', async () => {
        envMock.NODE_ENV = 'production';
        delete process.env.MFA_REQUIRED_ROLES;
        const s = await emitirSesion(usuario(['super_admin'], false), tokenService, repo);
        expect(s.user.mfaPendiente).toBe(true);
        expect(tokenService.generateAccessToken).toHaveBeenLastCalledWith(expect.objectContaining({ mfaPending: true }));
    });

    test('super_admin CON 2FA → sin mfaPending', async () => {
        envMock.NODE_ENV = 'production';
        const s = await emitirSesion(usuario(['super_admin'], true), tokenService, repo);
        expect(s.user.mfaPendiente).toBeUndefined();
        expect(s.user.mfaActivo).toBe(true);
        expect(tokenService.generateAccessToken.mock.calls.at(-1)[0]).not.toHaveProperty('mfaPending');
    });

    test('en test/dev nadie queda pendiente (el login demo y la suite no se traban)', async () => {
        const s = await emitirSesion(usuario(['super_admin'], false), tokenService, repo);
        expect(s.user.mfaPendiente).toBeUndefined();
    });
});

describe('authenticate: sesión con mfaPending sólo puede configurar el 2FA', () => {
    const correr = (user: any, url: string) => {
        const next = jest.fn();
        let error: any = null;
        context.run({ user } as any, () => {
            try { authenticate({ originalUrl: url } as any, {} as any, next); } catch (e) { error = e; }
        });
        return { next, error };
    };

    test('sesión normal pasa a cualquier ruta', () => {
        const r = correr({ userId: 1, roles: ['admin'] }, '/api/ventas');
        expect(r.next).toHaveBeenCalled();
    });

    test('mfaPending: bloqueada en la API de negocio con MFA_ENROLLMENT_REQUIRED', () => {
        for (const url of ['/api/ventas', '/api/usuarios', '/api/concesionarias?x=1', '/api/auditoria']) {
            const r = correr({ userId: 1, roles: ['super_admin'], mfaPending: true }, url);
            expect(r.next).not.toHaveBeenCalled();
            expect(r.error.statusCode).toBe(403);
            expect(r.error.errorCode).toBe('MFA_ENROLLMENT_REQUIRED');
        }
    });

    test('mfaPending: puede usar /api/auth/* (configurar el 2FA, refrescar, salir)', () => {
        for (const url of ['/api/auth/2fa/setup', '/api/auth/2fa/enable?x=1', '/api/auth/2fa/status', '/api/auth/logout']) {
            expect(correr({ userId: 1, roles: ['super_admin'], mfaPending: true }, url).next).toHaveBeenCalled();
        }
    });

    test('un path que sólo se PARECE a /api/auth/ no se cuela', () => {
        for (const url of ['/api/authx/2fa', '/api/ventas?next=/api/auth/', '/api/usuarios/../ventas']) {
            expect(correr({ userId: 1, roles: ['super_admin'], mfaPending: true }, url).next).not.toHaveBeenCalled();
        }
    });
});

describe('authEvents.clasificar: segundo factor', () => {
    test.each([['/login/2fa', 401, 'login_fail'], ['/login/2fa', 400, 'login_fail'], ['/login/2fa', 200, null], ['/login/2fa', 429, null]])(
        '%s %i → %s', (path, status, esperado) => {
            expect(clasificar(path as string, status as number)).toBe(esperado);
        });
});

describe('política de contraseñas nuevas', () => {
    test('acepta una contraseña de 10+ caracteres que no sea común', () => {
        expect(passwordNueva().safeParse('correcto-caballo-9').success).toBe(true);
    });

    test.each([['corta1'], ['123456789'], ['abcdefghi']])('menos de 10 caracteres (%s) se rechaza', (p) => {
        expect(passwordNueva().safeParse(p).success).toBe(false);
    });

    test.each([['1234567890'], ['qwertyuiop'], ['Password123'], ['CONTRASEÑA123'], ['Admin123456']])('contraseña común (%s) se rechaza', (p) => {
        expect(esContrasenaComun(p)).toBe(true);
        expect(passwordNueva().safeParse(p).success).toBe(false);
    });

    test('más de 72 BYTES se rechaza (bcrypt trunca ahí); 72 justos pasan', () => {
        expect(passwordNueva().safeParse('a'.repeat(72)).success).toBe(true);
        expect(passwordNueva().safeParse('a'.repeat(73)).success).toBe(false);
        // 40 caracteres de 2 bytes = 80 bytes
        expect(passwordNueva().safeParse('ñ'.repeat(40)).success).toBe(false);
    });

    test('se aplica en los cuatro flujos de contraseña nueva', () => {
        const mala = 'corta';
        expect(createUsuarioSchema.safeParse({ nombre: 'A', email: 'a@x.com', password: mala, roleIds: [] }).success).toBe(false);
        expect(resetUsuarioPasswordSchema.safeParse({ password: mala }).success).toBe(false);
        expect(changeMyPasswordSchema.safeParse({ currentPassword: 'x', newPassword: mala }).success).toBe(false);
        expect(resetPasswordSchema.safeParse({ token: 't', password: mala }).success).toBe(false);
        const buena = 'correcto-caballo-9';
        expect(resetUsuarioPasswordSchema.safeParse({ password: buena }).success).toBe(true);
        expect(changeMyPasswordSchema.safeParse({ currentPassword: 'x', newPassword: buena }).success).toBe(true);
    });
});

describe('schemas de 2FA', () => {
    test('login2fa: exactamente UNO de code / recoveryCode', () => {
        expect(login2faSchema.safeParse({ mfaToken: 't', code: '123456' }).success).toBe(true);
        expect(login2faSchema.safeParse({ mfaToken: 't', recoveryCode: 'ABCDE-FGHJK' }).success).toBe(true);
        expect(login2faSchema.safeParse({ mfaToken: 't' }).success).toBe(false);
        expect(login2faSchema.safeParse({ mfaToken: 't', code: '123456', recoveryCode: 'ABCDE-FGHJK' }).success).toBe(false);
        expect(login2faSchema.safeParse({ code: '123456' }).success).toBe(false);
    });

    test('disable: contraseña + un código', () => {
        expect(mfaDisableSchema.safeParse({ password: 'x', code: '123456' }).success).toBe(true);
        expect(mfaDisableSchema.safeParse({ code: '123456' }).success).toBe(false);
        expect(mfaDisableSchema.safeParse({ password: 'x' }).success).toBe(false);
    });
});
