import { MAX_PAGE_SIZE, parseOrderBy, parsePagination } from '../../src/infrastructure/database/queryOptions';

// Unit tests PUROS (sin DB): paginación acotada y orden por columnas seguras.
describe('parsePagination', () => {
    test('sin parámetros: limit 20, página 1', () => {
        expect(parsePagination({})).toEqual({ limit: 20, page: 1, skip: 0 });
        expect(parsePagination()).toEqual({ limit: 20, page: 1, skip: 0 });
    });

    test('acepta strings numéricos (así llega el query string)', () => {
        expect(parsePagination({ limit: '50', page: '3' })).toEqual({ limit: 50, page: 3, skip: 100 });
    });

    test('limit gigante se recorta al tope', () => {
        expect(parsePagination({ limit: '1000000' }).limit).toBe(MAX_PAGE_SIZE);
        expect(parsePagination({ limit: 1e12 }).limit).toBe(MAX_PAGE_SIZE);
    });

    test('el tope NO trunca lo que el front pide hoy (hasta 2000)', () => {
        expect(parsePagination({ limit: 2000 }).limit).toBe(2000);
        expect(parsePagination({ limit: 1000 }).limit).toBe(1000);
    });

    test.each([['-5'], ['0'], ['abc'], [''], [null], [undefined], [NaN]])('limit inválido %p cae al default', (limit) => {
        expect(parsePagination({ limit }).limit).toBe(20);
    });

    test.each([['-1'], ['0'], ['x'], [null]])('page inválida %p cae a 1', (page) => {
        expect(parsePagination({ page }).page).toBe(1);
    });

    test('page absurda no desborda el skip (Int de 32 bits)', () => {
        const p = parsePagination({ limit: MAX_PAGE_SIZE, page: 1e15 });
        expect(p.skip).toBeLessThan(2 ** 31);
    });

    test('defaultLimit y maxLimit configurables', () => {
        expect(parsePagination({}, { defaultLimit: 50 }).limit).toBe(50);
        expect(parsePagination({ limit: 500 }, { maxLimit: 100 }).limit).toBe(100);
    });
});

describe('parseOrderBy', () => {
    test('columna válida del modelo', () => {
        expect(parseOrderBy('Venta', 'createdAt', 'asc')).toEqual({ createdAt: 'asc' });
        expect(parseOrderBy('Usuario', 'nombre', 'desc')).toEqual({ nombre: 'desc' });
    });

    test('sortOrder distinto de asc/desc → desc', () => {
        expect(parseOrderBy('Venta', 'createdAt', 'DROP')).toEqual({ createdAt: 'desc' });
        expect(parseOrderBy('Venta', 'createdAt', undefined)).toEqual({ createdAt: 'desc' });
    });

    test('NO se puede ordenar por passwordHash (oráculo de orden)', () => {
        expect(parseOrderBy('Usuario', 'passwordHash', 'asc')).toEqual({ createdAt: 'asc' });
    });

    test('columnas sensibles de otros modelos tampoco', () => {
        // El fallback lo decide el repo; acá alcanza con que no devuelva la columna pedida.
        for (const [model, col] of [['Usuario', 'passwordHash'], ['RefreshToken', 'token'], ['PasswordResetToken', 'tokenHash']]) {
            expect(Object.keys(parseOrderBy(model, col, 'asc'))).not.toContain(col);
        }
    });

    test('relaciones, columnas inexistentes y valores no-string caen al fallback', () => {
        expect(parseOrderBy('Venta', 'cliente', 'asc')).toEqual({ createdAt: 'asc' });
        expect(parseOrderBy('Venta', 'no_existe', 'asc', 'id')).toEqual({ id: 'asc' });
        expect(parseOrderBy('Venta', { $gt: 1 }, 'asc')).toEqual({ createdAt: 'asc' });
        expect(parseOrderBy('Venta', ['createdAt'], 'asc')).toEqual({ createdAt: 'asc' });
        expect(parseOrderBy('ModeloQueNoExiste', 'x', 'asc')).toEqual({ createdAt: 'asc' });
    });
});
