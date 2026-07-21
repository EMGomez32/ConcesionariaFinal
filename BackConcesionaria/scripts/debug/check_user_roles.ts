import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL || '';
const pool = new Pool({ connectionString: connectionString.replace('prisma+postgres://', 'postgres://') });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    const usuario = await prisma.usuario.findFirst({
        where: { email: 'admin@demo.com' },
        include: {
            roles: {
                include: {
                    rol: true
                }
            }
        }
    });
    
    console.log('Usuario:', JSON.stringify(usuario, null, 2));
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
