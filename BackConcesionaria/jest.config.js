/** @type {import('ts-jest').JestConfigWithTsJest} */
// Tests de integración contra el stack docker corriendo (port 3000).
// No mockeamos Prisma — queremos validar comportamiento real:
// RLS, triggers, soft-delete, state machines, extension de Prisma.
//
// Antes de correr `npm test`, asegurate que el stack esté arriba:
//   docker compose -p concesionaria-wt up -d
//
// La suite asume:
//   API_BASE_URL = http://localhost:3000  (override con env var)
//   Usuarios seed: superadmin@demo.com/super123 y admin@demo.com/admin123
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'ts'],
    roots: ['<rootDir>/tests'],
    testRegex: '.*\\.test\\.ts$',
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest',
    },
    testTimeout: 30000,
    // Forzar serial: los tests crean datos compartidos (segunda concesionaria,
    // vehículos, ventas) y correrlos en paralelo genera flakes.
    maxWorkers: 1,
};
