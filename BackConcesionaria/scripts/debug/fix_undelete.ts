import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const result = await prisma.concesionaria.updateMany({
            where: { deletedAt: { not: null } },
            data: { deletedAt: null }
        });
        console.log(`Updated ${result.count} concesionarias (undeleted).`);

        const all = await prisma.concesionaria.findMany();
        console.log('Total concesionarias in DB:', all.length);
        console.log('Details:', JSON.stringify(all, null, 2));
    } catch (error) {
        console.error('Error during undelete:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
