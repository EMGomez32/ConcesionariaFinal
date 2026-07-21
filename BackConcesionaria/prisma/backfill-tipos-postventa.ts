/**
 * Vincula los casos de postventa históricos al catálogo TipoPostventa.
 *
 * Antes, `postventa_casos.tipo` era texto libre. Al introducirse el catálogo, la
 * columna vieja quedó como histórico y los casos existentes tienen `tipo_id` en
 * null. Este script, por cada concesionaria:
 *   1. junta los tipos distintos que haya en texto (ignorando mayúsculas y
 *      espacios, así "mecanica" y " Mecánica " no generan dos entradas),
 *   2. crea en el catálogo los que falten,
 *   3. apunta cada caso a su tipo.
 *
 * Es idempotente: correrlo dos veces no duplica nada. No borra la columna vieja
 * ni la pisa, así que si algo sale mal el dato original sigue estando.
 *
 * Uso:  npx tsx prisma/backfill-tipos-postventa.ts
 *       npx tsx prisma/backfill-tipos-postventa.ts --dry-run
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Mismo armado que seed-demo.ts: este proyecto usa driver adapters, así que el
// cliente no se puede construir sin opciones.
const connectionString = (process.env.DATABASE_URL || '').replace('prisma+postgres://', 'postgres://');
const pool = new Pool({ connectionString, max: 1 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

const dryRun = process.argv.includes('--dry-run');

/** Clave de comparación: sin espacios sobrantes, sin mayúsculas y sin acentos. */
function normalizar(valor: string): string {
    return valor
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

/** "mecanica" -> "Mecanica". Se respeta el texto si ya viene capitalizado. */
function titulo(valor: string): string {
    const limpio = valor.trim();
    return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

async function main() {
    if (dryRun) console.log('— DRY RUN: no se escribe nada —\n');

    // Sin el filtro de la extensión RLS: este script corre fuera de un request,
    // así que recorre todas las concesionarias a propósito.
    const casos = await prisma.postventaCaso.findMany({
        where: { tipoId: null, tipo: { not: null }, deletedAt: null },
        select: { id: true, concesionariaId: true, tipo: true },
    });

    if (casos.length === 0) {
        console.log('No hay casos con tipo en texto y sin vincular. Nada que hacer.');
        return;
    }

    // concesionariaId -> (tipo normalizado -> texto original)
    const porTenant = new Map<number, Map<string, string>>();
    for (const c of casos) {
        const clave = normalizar(c.tipo!);
        if (!clave) continue;
        if (!porTenant.has(c.concesionariaId)) porTenant.set(c.concesionariaId, new Map());
        porTenant.get(c.concesionariaId)!.set(clave, c.tipo!);
    }

    let creados = 0;
    let vinculados = 0;

    for (const [concesionariaId, tipos] of porTenant) {
        // Lo que ya existe en el catálogo de este tenant.
        const existentes = await prisma.tipoPostventa.findMany({ where: { concesionariaId } });
        const porClave = new Map(existentes.map((t) => [normalizar(t.nombre), t]));

        for (const [clave, textoOriginal] of tipos) {
            let tipo = porClave.get(clave);

            if (!tipo) {
                const nombre = titulo(textoOriginal);
                console.log(`  [tenant ${concesionariaId}] crear tipo "${nombre}"`);
                if (!dryRun) {
                    tipo = await prisma.tipoPostventa.create({
                        data: { concesionariaId, nombre, activo: true },
                    });
                    porClave.set(clave, tipo);
                }
                creados++;
            }

            // Los casos de este tenant cuyo texto normaliza a esta clave. El
            // `mode: insensitive` cubre mayúsculas; los acentos se resuelven
            // comparando en memoria más abajo.
            const candidatos = casos.filter(
                (c) => c.concesionariaId === concesionariaId && normalizar(c.tipo!) === clave,
            );

            if (!dryRun && tipo) {
                const r = await prisma.postventaCaso.updateMany({
                    where: { id: { in: candidatos.map((c) => c.id) } },
                    data: { tipoId: tipo.id },
                });
                vinculados += r.count;
            } else {
                vinculados += candidatos.length;
            }
            console.log(`  [tenant ${concesionariaId}] "${textoOriginal}" -> ${candidatos.length} caso(s)`);
        }
    }

    console.log(`\n${dryRun ? '[dry-run] ' : ''}Tipos creados: ${creados} · Casos vinculados: ${vinculados}`);
}

main()
    .catch((e) => { console.error('Error en el backfill:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
