import prisma from './src/prisma';

async function checkSucursales() {
    try {
        const sucursales = await prisma.sucursal.findMany({
            include: {
                concesionaria: {
                    select: {
                        nombre: true
                    }
                }
            }
        });
        
        console.log(`\n📊 Total sucursales in database: ${sucursales.length}\n`);
        
        if (sucursales.length === 0) {
            console.log('❌ No sucursales found in database!');
        } else {
            sucursales.forEach(s => {
                console.log(`  ✓ ID: ${s.id}`);
                console.log(`    Nombre: ${s.nombre}`);
                console.log(`    Concesionaria: ${s.concesionaria.nombre} (ID: ${s.concesionariaId})`);
                console.log(`    Activo: ${s.activo}`);
                console.log('');
            });
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSucursales();
