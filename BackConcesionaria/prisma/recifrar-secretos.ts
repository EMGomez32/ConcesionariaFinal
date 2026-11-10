/**
 * recifrar-secretos.ts — pasa TODOS los secretos en reposo a v2 con la clave actual (APP-05).
 *
 * Cierra una rotación de INTEGRACIONES_SECRET_KEY y termina con los v1 (sin AAD) y el texto
 * plano legado. Qué recorre y cómo: src/infrastructure/security/recifradoSecretos.ts.
 *
 * ── USO ──────────────────────────────────────────────────────────────────────────
 *   npm run recifrar-secretos               # SIMULACIÓN: cuenta por versión/kid, no toca nada
 *   npm run recifrar-secretos -- --apply    # re-cifra
 *
 * En el servidor (contenedor del backend, que ya tiene DATABASE_URL y las claves):
 *   docker compose exec -T backend npm run recifrar-secretos </dev/null
 *   docker compose exec -T backend npm run recifrar-secretos -- --apply </dev/null
 * (el `</dev/null` evita que `exec -T` se coma el stdin de un script pipeado por SSH).
 *
 * ── ROTACIÓN (resumen; completo en docs/seguridad/criptografia-y-secretos.md) ─────
 *   1. Clave nueva en INTEGRACIONES_SECRET_KEY; la vieja a INTEGRACIONES_SECRET_KEYS_ANTERIORES.
 *   2. Deploy (`docker compose up -d backend`): lee con las dos, cifra con la nueva.
 *   3. Esta simulación, y después `--apply`.
 *   4. Otra simulación: tiene que dar 0 a re-cifrar y 0 ilegibles. Recién ahí se saca la vieja
 *      de ANTERIORES y se vuelve a deployar.
 *
 * ── GUARDAS ──────────────────────────────────────────────────────────────────────
 *   - Por defecto es una SIMULACIÓN. Aplicar exige `--apply` explícito; un argumento
 *     desconocido aborta (un `--aply` mal escrito no puede pasar por una corrida real).
 *   - NUNCA imprime un secreto ni un valor cifrado: sólo contextos (tabla:id:campo),
 *     versiones, kids y cantidades. Tampoco el mensaje crudo de un error de Prisma.
 *   - Lo que no se puede abrir (falta la clave de su kid, no autentica) NO se toca y hace
 *     terminar con código 1: es la señal de NO sacar ninguna clave de ANTERIORES.
 *   - Idempotente: correrlo dos veces no cambia nada la segunda.
 *
 * ── POR QUÉ CON DATABASE_URL ─────────────────────────────────────────────────────
 * Recorre los secretos de TODAS las concesionarias (y los de usuarios sin tenant, como el
 * super_admin): es una tarea de plataforma, como la retención. Usa la conexión de
 * migraciones y además prende `app.is_super_admin` en la sesión, igual que retencion.ts, para
 * que también funcione si esa conexión dejara de ser superusuario y la RLS filtrara.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { hayClaveDeSecretos } from '../src/infrastructure/security/secretBox';
import {
    aplicarRecifrado,
    motivoSeguro,
    planificarRecifrado,
    resumirPlan,
} from '../src/infrastructure/security/recifradoSecretos';

const P = '[recifrar-secretos]';

function leerArgs(argv: string[]): { aplicar: boolean } {
    let aplicar = false;
    for (const a of argv) {
        if (a === '--apply') aplicar = true;
        else throw new Error(`argumento desconocido: ${a} (el único que existe es --apply)`);
    }
    return { aplicar };
}

async function main() {
    const { aplicar } = leerArgs(process.argv.slice(2));
    if (!process.env.DATABASE_URL) {
        throw new Error('Falta DATABASE_URL (la conexión de migraciones). El script no corre contra la conexión de la app.');
    }
    if (!hayClaveDeSecretos()) {
        throw new Error('Falta INTEGRACIONES_SECRET_KEY: sin la clave actual no hay con qué cifrar.');
    }

    const connectionString = process.env.DATABASE_URL.replace('prisma+postgres://', 'postgres://');
    // max 1: el set_config de sesión de abajo vale para todas las consultas.
    const pool = new Pool({ connectionString, max: 1 });
    const db = new PrismaClient({ adapter: new PrismaPg(pool) } as any);
    try {
        await db.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'true', false)`);

        console.log(`${P} ${aplicar ? 'APLICANDO' : 'SIMULACIÓN (nada se modifica; usá --apply para re-cifrar)'}`);
        const plan = await planificarRecifrado(db);
        console.log(`${P} clave actual: ${plan.kids.actual} · anteriores: ${plan.kids.anteriores.length ? plan.kids.anteriores.join(', ') : 'ninguna'}`);
        for (const linea of resumirPlan(plan)) console.log(`${P} ${linea}`);

        const ilegibles = plan.items.filter((i) => i.ilegible).length;
        if (ilegibles > 0) {
            console.error(`${P} ATENCIÓN: hay ${ilegibles} secreto(s) que no se pueden abrir con las claves configuradas. No saques ninguna clave de INTEGRACIONES_SECRET_KEYS_ANTERIORES hasta resolverlo.`);
            process.exitCode = 1;
        }

        if (!aplicar) {
            console.log(`${P} fin de la simulación.`);
            return;
        }

        const r = await aplicarRecifrado(db, plan);
        console.log(`${P} listo: ${r.recifrados} re-cifrado(s); ${r.cambiaronDuranteLaCorrida} cambiaron durante la corrida (la app ya los guardó; se ven en la próxima).`);
        if (r.errores.length > 0) {
            console.error(`${P} ${r.errores.length} error(es):\n  ${r.errores.slice(0, 50).join('\n  ')}`);
            process.exitCode = 1;
        }

        // Verificación: lo que quedó, leído de nuevo de la base.
        const despues = await planificarRecifrado(db);
        const quedan = despues.items.filter((i) => i.recifrar).length;
        const ilegiblesDespues = despues.items.filter((i) => i.ilegible).length;
        if (quedan === 0 && ilegiblesDespues === 0) {
            console.log(`${P} verificado: todo está en v2 con la clave ${despues.kids.actual}. Ya se pueden sacar las claves anteriores.`);
        } else {
            console.log(`${P} quedan ${quedan} a re-cifrar y ${ilegiblesDespues} ilegible(s): todavía NO saques las claves anteriores.`);
            process.exitCode = 1;
        }
    } finally {
        await db.$disconnect();
        await pool.end();
    }
}

main().catch((e) => {
    // motivoSeguro y no e.message: el mensaje de un error de Prisma puede traer los
    // argumentos de la consulta (o sea, un secreto). Los errores propios del script sí se
    // muestran: los escribimos nosotros y no llevan valores.
    const propio = e instanceof Error && e.constructor === Error;
    console.error(`${P} falló: ${propio ? e.message : motivoSeguro(e)}`);
    process.exit(1);
});
