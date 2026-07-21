import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// En Prisma 7, usamos el adapter para conectar si el schema no tiene URL definida
// IMPORTANTE: DATABASE_URL debe ser una URL de postgres estándar (postgres://...)
// Si usas prisma+postgres://, debes usar la URL que te da el comando 'prisma dev'.
const connectionString = process.env.DATABASE_URL || '';
// Pool size 1 so the `set_config` below sticks for every query of this seed.
const pool = new Pool({ connectionString: connectionString.replace('prisma+postgres://', 'postgres://'), max: 1 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

// ─────────────────────────────────────────────────────────────────────────────
// Credenciales del admin inicial: SIEMPRE por variables de entorno.
// Nunca hardcodear contraseñas — el sistema queda accesible en internet.
// Definir en el .env del servidor:
//   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD  (obligatorias para crear el admin)
//   SEED_CONCESIONARIA_NOMBRE, SEED_CONCESIONARIA_CUIT, SEED_CONCESIONARIA_EMAIL,
//   SEED_SUCURSAL_NOMBRE  (opcionales — tienen defaults razonables no sensibles)
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL?.trim();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const ADMIN_NOMBRE = process.env.SEED_ADMIN_NOMBRE?.trim() || 'Administrador';

const CONCESIONARIA_NOMBRE = process.env.SEED_CONCESIONARIA_NOMBRE?.trim() || 'Concesionaria';
const CONCESIONARIA_CUIT = process.env.SEED_CONCESIONARIA_CUIT?.trim() || null;
const CONCESIONARIA_EMAIL = process.env.SEED_CONCESIONARIA_EMAIL?.trim() || null;
const SUCURSAL_NOMBRE = process.env.SEED_SUCURSAL_NOMBRE?.trim() || 'Casa Central';

// Weak-password guard: bloquea contraseñas triviales que alguien podría dejar
// por accidente en el .env.
const WEAK_PASSWORDS = new Set(['admin123', 'super123', 'password', '12345678', 'changeme']);

async function main() {
    console.log('Iniciando seed...');

    // Bypass RLS for the seed: set the session var the policies look at.
    // false = session-scoped (stays until the connection closes); the pool
    // above is capped at 1 conn so this value applies to every query.
    await prisma.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'true', false)`);

    // 1. Roles (idempotente, sin datos sensibles) ──────────────────────────────
    const roles = [
        { nombre: 'admin' },
        { nombre: 'vendedor' },
        { nombre: 'cobrador' },
        { nombre: 'postventa' },
        { nombre: 'lectura' },
        { nombre: 'super_admin' },
    ];

    for (const rol of roles) {
        await prisma.rol.upsert({
            where: { nombre: rol.nombre as any },
            update: {},
            create: rol as any,
        });
    }
    console.log('Roles OK.');

    // 2. Plan por defecto (idempotente) ────────────────────────────────────────
    const planFree = await prisma.plan.upsert({
        where: { nombre: 'Free' },
        update: {},
        create: {
            nombre: 'Free',
            precio: 0,
            moneda: 'ARS',
            maxUsuarios: 5,
            maxSucursales: 1,
            maxVehiculos: 50,
        },
    });
    console.log('Plan Free OK.');

    // 3. Bootstrap del admin inicial ───────────────────────────────────────────
    // Solo si están definidas las credenciales por env. Si ya existe alguna
    // concesionaria, no crea nada (evita duplicar en cada arranque / re-seed).
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.log(
            '\n⚠  SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD no definidas: se omite la creación del admin inicial.' +
            '\n   Roles y plan quedaron cargados. Para crear el admin, definí esas variables y volvé a correr el seed.\n'
        );
        console.log('Seed finalizado (sin admin).');
        return;
    }

    if (ADMIN_PASSWORD.length < 10) {
        throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 10 caracteres.');
    }
    if (WEAK_PASSWORDS.has(ADMIN_PASSWORD.toLowerCase())) {
        throw new Error('SEED_ADMIN_PASSWORD es una contraseña trivial/conocida. Usá una fuerte.');
    }

    const existingConcesionaria = await prisma.concesionaria.findFirst({
        include: { sucursales: true },
    });

    if (existingConcesionaria) {
        console.log(
            `\nℹ  Ya existe la concesionaria "${existingConcesionaria.nombre}". ` +
            'No se crea admin de bootstrap (la base no está vacía).\n'
        );
        console.log('Seed finalizado (base ya inicializada).');
        return;
    }

    const concesionaria = await prisma.concesionaria.create({
        data: {
            nombre: CONCESIONARIA_NOMBRE,
            cuit: CONCESIONARIA_CUIT,
            email: CONCESIONARIA_EMAIL,
            subscription: {
                create: {
                    planId: planFree.id,
                    status: 'active',
                },
            },
            sucursales: {
                create: {
                    nombre: SUCURSAL_NOMBRE,
                },
            },
        },
        include: { sucursales: true },
    });
    console.log(`Concesionaria "${concesionaria.nombre}" creada.`);

    const adminRole = await prisma.rol.findUnique({ where: { nombre: 'admin' } });
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    if (adminRole) {
        await prisma.usuario.create({
            data: {
                nombre: ADMIN_NOMBRE,
                email: ADMIN_EMAIL,
                passwordHash,
                concesionariaId: concesionaria.id,
                sucursalId: concesionaria.sucursales[0].id,
                roles: { create: { rolId: adminRole.id } },
            },
        });
        console.log(`Usuario admin creado (${ADMIN_EMAIL}). Contraseña tomada del entorno.`);
    }

    console.log('\nSeed finalizado con éxito.');
}

main()
    .catch((e) => {
        console.error('Error en seed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
