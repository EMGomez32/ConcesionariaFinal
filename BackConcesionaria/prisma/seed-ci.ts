/**
 * seed-ci.ts — bootstrap MÍNIMO y reproducible para los tests de integración en CI.
 *
 * Crea sólo lo que las suites de `tests/integration` asumen preexistente:
 *   - los 6 roles (RolNombre)
 *   - un plan Free (holgado, para no chocar con límites en los tests)
 *   - una concesionaria de test con una sucursal
 *   - los dos usuarios demo con que las suites loginean (helpers.ts):
 *       superadmin@demo.com / super123  (super_admin, CON concesionariaId — varias
 *                                        suites usan sa.user.concesionariaId!)
 *       admin@demo.com     / admin123   (admin)
 *
 * NO carga datos de negocio: cada suite crea los suyos por la API.
 *
 * Idempotente (busca por email/nombre antes de crear). Pensado SOLO para CI/test:
 * usa contraseñas débiles a propósito (las que esperan los tests, que seed.ts
 * bloquea). Se niega a correr con NODE_ENV=production.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// ── Guardas anti-producción ────────────────────────────────────────────────
// seed-ci planta credenciales DÉBILES y PÚBLICAS (superadmin@demo.com/super123 con
// rol super_admin = acceso total de plataforma). NODE_ENV solo no alcanza: el
// camino realista de correrlo mal es un shell del host (`DATABASE_URL=<prod> npm
// run seed-ci`) donde NODE_ENV no está seteada. Por eso se exige, y si algo falla
// se aborta:
//   1. NO estar en NODE_ENV=production.
//   2. Opt-in explícito: CI=true (lo setea GitHub Actions) o SEED_CI_FORCE=true.
//   3. Que DATABASE_URL luzca de test: host local o nombre de base terminado en _test.
const DB_URL = process.env.DATABASE_URL || '';
const isProduction = process.env.NODE_ENV === 'production';
const hasOptIn = process.env.CI === 'true' || process.env.SEED_CI_FORCE === 'true';
const looksLikeTestDb =
    /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL) || /\/[^/?]*_test(\?|$)/.test(DB_URL);
if (isProduction || !hasOptIn || !looksLikeTestDb) {
    console.error('Rechazado: seed-ci sólo corre en CI o contra una base de test descartable.');
    console.error('  Crea credenciales débiles públicas (super123/admin123). Para forzarlo en local:');
    console.error('  SEED_CI_FORCE=true y DATABASE_URL apuntando a una base *_test / localhost.');
    console.error(`  [NODE_ENV=${process.env.NODE_ENV ?? '(unset)'} · opt-in=${hasOptIn} · db-test=${looksLikeTestDb}]`);
    process.exit(1);
}

const connectionString = (process.env.DATABASE_URL || '').replace('prisma+postgres://', 'postgres://');
// Pool cap 1 → el set_config de bypass RLS de abajo aplica a todas las queries.
const pool = new Pool({ connectionString, max: 1 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

const ROLES = ['admin', 'vendedor', 'cobrador', 'postventa', 'lectura', 'super_admin', 'tasador'] as const;
const CONC_NOMBRE = 'Concesionaria Test CI';

async function ensureUsuario(
    email: string,
    nombre: string,
    password: string,
    concesionariaId: number,
    sucursalId: number,
    rolId: number
): Promise<void> {
    const existing = await prisma.usuario.findFirst({ where: { email } });
    if (existing) {
        console.log(`  usuario ${email} ya existe (id ${existing.id})`);
        return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const u = await prisma.usuario.create({
        data: {
            nombre,
            email,
            passwordHash,
            activo: true,
            concesionariaId,
            sucursalId,
            roles: { create: { rolId } },
        },
    });
    console.log(`  usuario ${email} creado (id ${u.id})`);
}

async function main() {
    // Bypass RLS para el seed: setea la session var que miran las policies.
    // false = scope de sesión (dura hasta cerrar la conexión); el pool cap 1
    // hace que aplique a cada query.
    await prisma.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'true', false)`);

    // 1. Roles (idempotente).
    for (const nombre of ROLES) {
        await prisma.rol.upsert({ where: { nombre: nombre as any }, update: {}, create: { nombre: nombre as any } });
    }
    console.log('roles OK');

    // 2. Plan Free holgado (para no toparse con límites de usuarios/vehículos en los tests).
    const plan = await prisma.plan.upsert({
        where: { nombre: 'Free' },
        update: {},
        create: { nombre: 'Free', precio: 0, moneda: 'ARS', maxUsuarios: 100, maxSucursales: 20, maxVehiculos: 1000 },
    });
    console.log('plan Free OK');

    // 3. Concesionaria de test + sucursal + subscription (idempotente por nombre).
    let conc = await prisma.concesionaria.findFirst({
        where: { nombre: CONC_NOMBRE },
        include: { sucursales: true },
    });
    if (!conc) {
        conc = await prisma.concesionaria.create({
            data: {
                nombre: CONC_NOMBRE,
                cuit: '30-99999999-9',
                email: 'ci@test.local',
                subscription: { create: { planId: plan.id, status: 'active' } },
                sucursales: { create: { nombre: 'Casa Central CI' } },
            },
            include: { sucursales: true },
        });
        console.log(`concesionaria "${CONC_NOMBRE}" creada (id ${conc.id})`);
    } else {
        console.log(`concesionaria "${CONC_NOMBRE}" ya existe (id ${conc.id})`);
    }
    const cid = conc.id;
    const sid = conc.sucursales[0].id;

    const superRol = (await prisma.rol.findUnique({ where: { nombre: 'super_admin' as any } }))!;
    const adminRol = (await prisma.rol.findUnique({ where: { nombre: 'admin' as any } }))!;

    // 4. Usuarios demo que esperan los tests (helpers.ts).
    await ensureUsuario('superadmin@demo.com', 'Super Admin CI', 'super123', cid, sid, superRol.id);
    await ensureUsuario('admin@demo.com', 'Admin CI', 'admin123', cid, sid, adminRol.id);

    console.log('\n✅ seed-ci OK');
}

main()
    .catch((e) => {
        console.error('Error en seed-ci:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
