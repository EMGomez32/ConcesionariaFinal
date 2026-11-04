// Unit test (sin DB): validación de email de la importación masiva de clientes.
// La regex anterior tenía backtracking cuadrático (ReDoS, CodeQL js/polynomial-redos):
// un email de ~100 KB con muchos puntos tardaba segundos.
jest.mock('../../src/infrastructure/database/prisma', () => ({ __esModule: true, default: {}, rawPrisma: {} }));
jest.mock('../../src/application/services/consultaIngest', () => ({ buscarClientePorContacto: jest.fn() }));

import { emailDeImportacionValido } from '../../src/application/services/clienteImport';

describe('emailDeImportacionValido', () => {
    test.each([
        ['ana@x.com', true],
        ['a.b+c@sub.dominio.com.ar', true],
        ['ana@x', false],
        ['ana@@x.com', false],
        ['ana @x.com', false],
        ['ana@x..com', false],
        ['ana@.com', false],
        ['@x.com', false],
    ])('%p → %p', (email, esperado) => {
        expect(emailDeImportacionValido(email)).toBe(esperado);
    });

    test('más de 254 caracteres → inválido', () => {
        expect(emailDeImportacionValido(`${'a'.repeat(250)}@x.com`)).toBe(false);
    });

    test('la cadena de ataque de CodeQL se resuelve en tiempo lineal', () => {
        const ataque = `!@!.${'!.'.repeat(200_000)} `;
        const inicio = Date.now();
        // Se prueba la regex sin el corte por largo: aun así tiene que ser rápida.
        expect(/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(ataque)).toBe(false);
        expect(emailDeImportacionValido(ataque)).toBe(false);
        expect(Date.now() - inicio).toBeLessThan(500);
    });
});
