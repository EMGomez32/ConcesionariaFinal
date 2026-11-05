// Unit test (sin DB): la ruta que se pega detrás de la URL de la API de Mercado Libre.
// Parte de la ruta sale de datos externos (el id de la pregunta de una notificación),
// y el Bearer de la cuenta va a donde diga la URL (CodeQL js/request-forgery).
jest.mock('../../src/config/env', () => ({ env: { NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(32) } }));
jest.mock('../../src/infrastructure/database/prisma', () => ({ __esModule: true, default: {}, rawPrisma: {} }));
jest.mock('../../src/infrastructure/logging/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

import { rutaDeApiSegura } from '../../src/infrastructure/mercadolibre/meliClient';
import { DestinoNoPermitidoError } from '../../src/infrastructure/security/destinoSeguro';

describe('rutaDeApiSegura', () => {
    test.each([
        ['/users/me', 'users/me'],
        ['/questions/search', 'questions/search'],
        ['/questions/13405912345', 'questions/13405912345'],
        ['/items/MLA1234567890', 'items/MLA1234567890'],
        ['/sites/MLA/listing_prices', 'sites/MLA/listing_prices'],
        ['/categories/MLA1744/attributes', 'categories/MLA1744/attributes'],
    ])('%p → %p (las rutas que usa el sistema pasan)', (ruta, esperado) => {
        expect(rutaDeApiSegura(ruta)).toBe(esperado);
    });

    test.each([
        ['URL absoluta', 'https://evil.example/x'],
        ['sin barra inicial', 'users/me'],
        ['doble barra (host relativo al protocolo)', '//evil.example/x'],
        ['salto de directorio', '/questions/../users/me'],
        ['punto', '/questions/./123'],
        ['query metida en el id', '/questions/123?access_token=x'],
        ['fragmento', '/questions/123#x'],
        ['porcentaje', '/questions/%2e%2e/users'],
        ['arroba', '/questions/@evil.example'],
        ['segmento vacío', '/questions//123'],
        ['barra final', '/questions/123/'],
        ['vacía', ''],
        ['sólo barra', '/'],
    ])('%s → rechazada', (_caso, ruta) => {
        expect(() => rutaDeApiSegura(ruta)).toThrow(DestinoNoPermitidoError);
    });
});
