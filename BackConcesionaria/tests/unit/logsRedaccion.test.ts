// Unit tests (sin DB): lo que se escribe en los logs no lleva credenciales ni datos
// personales del query string (PRIV-09 / APP-17).
const error = jest.fn();
jest.mock('../../src/infrastructure/logging/logger', () => ({ logger: { error: (...a: unknown[]) => error(...a), warn: jest.fn(), info: jest.fn() } }));
const envMock: Record<string, unknown> = { NODE_ENV: 'production' };
jest.mock('../../src/config/env', () => ({ env: envMock }));

import { urlParaLog } from '../../src/interface/middlewares/requestLogger.middleware';
import { errorHandler } from '../../src/interface/middlewares/error.middleware';

describe('urlParaLog', () => {
    test.each([
        ['/api/search?q=30111222', '30111222'],
        ['/api/clientes?search=perez&dni=30111222&telefono=1155554444&email=ana%40x.com', '30111222'],
        ['/api/clientes?nombre=Ana&apellido=Gomez', 'Gomez'],
        ['/uploads/solicitudes-1/2026-11/a.pdf?exp=1&sig=' + 'a'.repeat(64), 'a'.repeat(64)],
        ['/api/webhooks/mercadolibre/callback?code=TG-123&state=eyJ', 'TG-123'],
    ])('%s no deja el valor sensible', (url, valor) => {
        const r = urlParaLog(url);
        expect(r).not.toContain(valor);
        expect(r).toContain('[redactado]');
    });

    test('conserva el path, el nombre del parámetro y los params inofensivos', () => {
        expect(urlParaLog('/api/clientes?page=2&dni=1&limit=20')).toBe('/api/clientes?page=2&dni=[redactado]&limit=20');
        expect(urlParaLog('/api/vehiculos?page=1')).toBe('/api/vehiculos?page=1');
        expect(urlParaLog('/api/vehiculos')).toBe('/api/vehiculos');
    });
});

describe('errorHandler', () => {
    const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }) as any;
    beforeEach(() => { error.mockClear(); envMock.NODE_ENV = 'production'; });

    test('loguea la URL redactada, no req.url crudo', () => {
        errorHandler(new Error('falló algo'), { url: '/clientes?dni=30111222', originalUrl: '/api/clientes?dni=30111222', method: 'GET' } as any, res(), jest.fn());
        const meta = error.mock.calls[0][1];
        expect(meta.url).not.toContain('30111222');
        expect(meta.url).toContain('/api/clientes');
    });

    test('en producción, de un error de Prisma loguea código y modelo, no el mensaje con los valores', () => {
        const err = Object.assign(new Error('Invalid `prisma.cliente.create()` invocation: { dni: "30111222", email: "ana@x.com" }'), {
            name: 'PrismaClientValidationError',
        });
        errorHandler(err, { url: '/x', originalUrl: '/api/x', method: 'POST' } as any, res(), jest.fn());
        const texto = JSON.stringify(error.mock.calls[0]);
        expect(texto).toContain('PrismaClientValidationError');
        expect(texto).not.toContain('30111222');
        expect(texto).not.toContain('ana@x.com');
    });

    test('fuera de producción el mensaje sigue saliendo (sirve para diagnosticar)', () => {
        envMock.NODE_ENV = 'development';
        const err = Object.assign(new Error('detalle útil'), { name: 'PrismaClientValidationError' });
        errorHandler(err, { url: '/x', originalUrl: '/api/x', method: 'POST' } as any, res(), jest.fn());
        expect(String(error.mock.calls[0][0])).toContain('detalle útil');
    });
});
