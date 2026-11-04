// Unit tests (sin DB ni red): notificador de alertas de seguridad y rastro deduplicado de
// las denegaciones de authorize.
const envMock: Record<string, unknown> = { NODE_ENV: 'production', SMTP_HOST: '', SECURITY_ALERT_WEBHOOK_URL: 'https://alertas.example/hook' };
jest.mock('../../src/config/env', () => ({ env: envMock }));
const warn = jest.fn();
jest.mock('../../src/infrastructure/logging/logger', () => ({ logger: { warn: (...a: unknown[]) => warn(...a), error: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
const recordSecurityEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/infrastructure/security/securityEvents', () => ({ recordSecurityEvent: (...a: unknown[]) => recordSecurityEvent(...a) }));

import { cuerpoDeAlerta, notificarAlertaSeguridad } from '../../src/infrastructure/security/alertasSeguridad';
import { authorize } from '../../src/interface/middlewares/authorize.middleware';
import { context } from '../../src/infrastructure/security/context';

const esperarMicrotareas = () => new Promise((r) => setImmediate(r));

describe('notificarAlertaSeguridad', () => {
    const fetchOriginal = global.fetch;
    let fetchMock: jest.Mock;
    beforeEach(() => {
        fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
        global.fetch = fetchMock as unknown as typeof fetch;
        envMock.SECURITY_ALERT_WEBHOOK_URL = 'https://alertas.example/hook';
        warn.mockClear();
    });
    afterAll(() => { global.fetch = fetchOriginal; });

    test('manda un POST JSON con ids y el email ENMASCARADO, sin IP ni nada más', async () => {
        notificarAlertaSeguridad({ tipo: 'refresh_reuse', usuarioId: 7, concesionariaId: 3, email: 'maria.lopez@empresa.com', detalle: 'x' });
        await esperarMicrotareas();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://alertas.example/hook');
        expect(init.method).toBe('POST');
        expect(init.signal).toBeDefined(); // timeout corto
        const body = JSON.parse(init.body);
        expect(body).toMatchObject({ origen: 'autenza', tipo: 'refresh_reuse', usuarioId: 7, concesionariaId: 3, email: 'ma***@empresa.com' });
        expect(JSON.stringify(body)).not.toContain('maria.lopez@empresa.com');
        expect(Object.keys(body).sort()).toEqual(['concesionariaId', 'detalle', 'email', 'entorno', 'fecha', 'origen', 'tipo', 'usuarioId']);
    });

    test('sin SECURITY_ALERT_WEBHOOK_URL no hace nada', async () => {
        envMock.SECURITY_ALERT_WEBHOOK_URL = undefined;
        notificarAlertaSeguridad({ tipo: 'super_admin_login', usuarioId: 1 });
        await esperarMicrotareas();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('un receptor caído no lanza ni bloquea: sólo deja un warn sin la URL', async () => {
        fetchMock.mockRejectedValue(Object.assign(new Error('boom'), { name: 'TimeoutError' }));
        expect(() => notificarAlertaSeguridad({ tipo: 'brute_force_alert' })).not.toThrow();
        await esperarMicrotareas();
        await esperarMicrotareas();
        const log = warn.mock.calls.map((c) => String(c[0])).join('\n');
        expect(log).toContain('brute_force_alert');
        expect(log).not.toContain('alertas.example');
    });

    test('cuerpoDeAlerta sin email lo deja en null', () => {
        expect(cuerpoDeAlerta({ tipo: 'brute_force_alert' }).email).toBeNull();
    });
});

describe('authorize: las denegaciones quedan en security_events, deduplicadas', () => {
    const correr = (userId: number, path: string, method = 'DELETE') => {
        const mw = authorize('admin');
        const req: any = { method, baseUrl: '/api/usuarios', route: { path }, originalUrl: `/api/usuarios/99?q=dni-123`, path };
        let error: any = null;
        context.run({ user: { userId, concesionariaId: 5, sucursalId: null, roles: ['vendedor'] }, correlationId: 'c' } as any, () => {
            try { mw(req, {} as any, () => undefined); } catch (e) { error = e; }
        });
        return error;
    };

    beforeEach(() => recordSecurityEvent.mockClear());

    test('la primera denegación de un usuario en una ruta se registra; las repetidas no', () => {
        expect(correr(901, '/:id')?.statusCode).toBe(403);
        correr(901, '/:id');
        correr(901, '/:id');
        const filas = recordSecurityEvent.mock.calls.map((c) => c[0]).filter((e: any) => e.accion === 'authorize_denied');
        expect(filas).toHaveLength(1);
        expect(filas[0]).toMatchObject({ usuarioId: 901, concesionariaId: 5 });
        // Se registra el PATRÓN de la ruta, no la URL con ids ni el query string.
        expect(filas[0].detalle).toContain('DELETE /api/usuarios/:id');
        expect(filas[0].detalle).not.toContain('dni-123');
    });

    test('otra ruta del mismo usuario sí deja su propia fila', () => {
        correr(902, '/:id');
        correr(902, '/:id/reset-password', 'POST');
        expect(recordSecurityEvent.mock.calls.filter((c) => c[0].accion === 'authorize_denied')).toHaveLength(2);
    });

    test('30 denegaciones de un mismo usuario en la ventana dejan UNA fila de ráfaga', () => {
        for (let i = 0; i < 40; i++) correr(903, '/:id');
        const rafagas = recordSecurityEvent.mock.calls.filter((c) => c[0].accion === 'authorize_denied_burst');
        expect(rafagas).toHaveLength(1);
        expect(rafagas[0][0].usuarioId).toBe(903);
    });
});
