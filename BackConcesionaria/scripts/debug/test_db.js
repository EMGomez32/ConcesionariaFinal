require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const all = await prisma.concesionaria.findMany();
        console.log('COUNT:', all.length);
        console.log('DATA:', JSON.stringify(all, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
