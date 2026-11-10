// Unit test (sin DB): costo de bcrypt configurable y detección de hashes viejos (APP-13).
import bcrypt from 'bcryptjs';
import { costoBcrypt, necesitaRehash } from '../../src/infrastructure/security/passwordHash';

describe('costoBcrypt', () => {
    const antes = { costo: process.env.BCRYPT_COST, entorno: process.env.NODE_ENV };
    afterEach(() => {
        if (antes.costo === undefined) delete process.env.BCRYPT_COST; else process.env.BCRYPT_COST = antes.costo;
        process.env.NODE_ENV = antes.entorno;
    });

    test('producción sin BCRYPT_COST → 12; fuera de producción → 10', () => {
        delete process.env.BCRYPT_COST;
        process.env.NODE_ENV = 'production';
        expect(costoBcrypt()).toBe(12);
        process.env.NODE_ENV = 'test';
        expect(costoBcrypt()).toBe(10);
    });

    test.each([['11', 11], ['14', 14], ['9', 12], ['15', 12], ['doce', 12], ['', 12]])('BCRYPT_COST=%p en producción → %p', (valor, esperado) => {
        process.env.NODE_ENV = 'production';
        process.env.BCRYPT_COST = valor;
        expect(costoBcrypt()).toBe(esperado);
    });
});

describe('necesitaRehash', () => {
    afterEach(() => { delete process.env.BCRYPT_COST; });

    test('un hash más barato que el costo actual se re-hashea; uno igual, no', () => {
        process.env.BCRYPT_COST = '11';
        expect(necesitaRehash(bcrypt.hashSync('x', 10))).toBe(true);
        expect(necesitaRehash(bcrypt.hashSync('x', 11))).toBe(false);
    });

    test('algo que no es un hash de bcrypt no se toca', () => {
        expect(necesitaRehash('no-es-un-hash')).toBe(false);
    });
});
