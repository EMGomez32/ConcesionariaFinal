/**
 * set-password.ts — cambia la contraseña (y opcionalmente activa/desactiva)
 * de un usuario existente, sin pasar por la UI ni Prisma Studio.
 *
 * Uso (dentro del contenedor backend):
 *   docker compose exec \
 *     -e USER_EMAIL=admin@demo.com \
 *     -e USER_PASSWORD='NuevaClaveFuerte123' \
 *     backend npx ts-node scripts/set-password.ts
 *
 * Para DESACTIVAR un usuario (ej. el super_admin demo) en vez de cambiarle la clave:
 *   docker compose exec -e USER_EMAIL=superadmin@demo.com -e USER_DEACTIVATE=true \
 *     backend npx ts-node scripts/set-password.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const connectionString = (process.env.DATABASE_URL || '').replace('prisma+postgres://', 'postgres://');
const pool = new Pool({ connectionString, max: 1 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const EMAIL = process.env.USER_EMAIL?.trim();
const PASSWORD = process.env.USER_PASSWORD;
const DEACTIVATE = process.env.USER_DEACTIVATE === 'true';

async function main() {
    if (!EMAIL) throw new Error('Falta USER_EMAIL.');
    if (!DEACTIVATE && !PASSWORD) throw new Error('Falta USER_PASSWORD (o USER_DEACTIVATE=true).');
    if (PASSWORD && PASSWORD.length < 10) throw new Error('La contraseña debe tener al menos 10 caracteres.');

    // Bypass RLS para poder tocar el usuario sin contexto de tenant.
    await prisma.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'true', false)`);

    const usuario = await prisma.usuario.findFirst({ where: { email: EMAIL } });
    if (!usuario) throw new Error(`No existe usuario con email ${EMAIL}.`);

    const data: any = {};
    if (PASSWORD) data.passwordHash = await bcrypt.hash(PASSWORD, 10);
    if (DEACTIVATE) data.activo = false;

    await prisma.usuario.update({ where: { id: usuario.id }, data });

    if (DEACTIVATE) console.log(`Usuario ${EMAIL} DESACTIVADO.`);
    if (PASSWORD) console.log(`Contraseña de ${EMAIL} actualizada.`);
}

main()
    .catch((e) => { console.error('Error:', e.message); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
