// Unit test (sin DB): normalización de filtros y elección de la columna de orden.
// Las claves y la columna de orden vienen del query string: no pueden tocar el
// prototipo del objeto ni elegir una columna fuera de la lista permitida.
import { claveDeOrden, coerceFilter } from '../../src/infrastructure/database/queryFilter';

describe('coerceFilter', () => {
    test('convierte ids y booleanos, descarta vacíos y deja el resto igual', () => {
        expect(coerceFilter({ clienteId: '7', activo: 'true', estado: 'disponible', dni: '30111222', marca: '' }))
            .toEqual({ clienteId: 7, activo: true, estado: 'disponible', dni: '30111222' });
    });

    test('numericKeys convierte columnas Int que no terminan en Id', () => {
        expect(coerceFilter({ anio: '2024', mes: '3' }, { numericKeys: ['anio', 'mes'] })).toEqual({ anio: 2024, mes: 3 });
    });

    test('__proto__, constructor y prototype se descartan y no cambian el prototipo', () => {
        const filtro = JSON.parse('{"__proto__": {"admin": true}, "constructor": "x", "prototype": "y", "estado": "vendido"}');
        const where = coerceFilter(filtro);
        expect(where).toEqual({ estado: 'vendido' });
        expect(Object.getPrototypeOf(where)).toBe(Object.prototype);
        expect((where as any).admin).toBeUndefined();
        expect(({} as any).admin).toBeUndefined();
    });

    test('sin filtro devuelve un objeto vacío', () => {
        expect(coerceFilter(undefined)).toEqual({});
        expect(coerceFilter(null)).toEqual({});
    });
});

describe('claveDeOrden', () => {
    const SORTABLE = ['createdAt', 'precioLista', 'anio'];

    test('una columna permitida se devuelve', () => {
        expect(claveDeOrden(SORTABLE, 'precioLista', 'createdAt')).toBe('precioLista');
    });

    test.each([
        ['otra columna', 'costoInterno'],
        ['__proto__', '__proto__'],
        ['undefined', undefined],
        ['un array de varias columnas', ['anio', 'precioLista']],
        ['un número', 7],
    ])('%s → el default', (_caso, pedida) => {
        expect(claveDeOrden(SORTABLE, pedida, 'createdAt')).toBe('createdAt');
    });
});
