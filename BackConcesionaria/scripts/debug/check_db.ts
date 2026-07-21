import prisma from './src/infrastructure/database/prisma';

async function main() {
    try {
        const count = await prisma.concesionaria.count();
        const activeCount = await prisma.concesionaria.count({ where: { deletedAt: null } });
        const all = await prisma.concesionaria.findMany();
        console.log('--- DB Check ---');
        console.log('Total count:', count);
        console.log('Active count (deletedAt: null):', activeCount);
        console.log('All concesionarias:', JSON.stringify(all, null, 2));
    } catch (error) {
        console.error('Error during check:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
