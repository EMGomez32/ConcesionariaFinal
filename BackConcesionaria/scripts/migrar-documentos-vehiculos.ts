/**
 * Mueve a la zona PRIVADA de /uploads los documentos de vehículos que se subieron antes de
 * que existiera (títulos, cédulas, boletos, comprobantes: todo archivo de la ficha del auto
 * que no es una foto).
 *
 * Hasta este cambio TODO archivo de un vehículo se guardaba en `vehiculos-<id>/…`, que es
 * zona pública: se servía sin sesión y con `Cache-Control: public` de una semana. Los nuevos
 * documentos ya van a `vehiculos-docs-<id>/…` (sólo con URL firmada). Este script hace lo
 * mismo con los viejos: mueve el binario y actualiza `url` y `storageKey` de la fila.
 *
 * USO (en el servidor, dentro del contenedor del backend):
 *   docker compose exec -T backend node dist-ops/scripts/migrar-documentos-vehiculos.js </dev/null           # simulación
 *   docker compose exec -T backend node dist-ops/scripts/migrar-documentos-vehiculos.js --aplicar </dev/null # mueve
 *   (compilado en dist-ops/: la imagen no trae ts-node; en local `npx ts-node scripts/migrar-documentos-vehiculos.ts`)
 *   (opcional) --dir <carpeta de uploads>; por defecto UPLOADS_DIR o ./uploads
 *
 * Es IDEMPOTENTE: lo que ya está en la zona privada se saltea, y si una corrida anterior
 * movió el archivo pero no llegó a actualizar la fila, la próxima sólo actualiza la fila.
 * Sin `--aplicar` no toca nada: lista lo que haría.
 *
 * DESPUÉS DE APLICAR: purgar en Cloudflare la caché de las URLs viejas que lista el script
 * (las sirvió como públicas hasta hoy) y correr el script otra vez para confirmar que no
 * queda nada pendiente.
 */
import fs from 'fs/promises';
import path from 'path';
import { withAuthBypass } from '../src/infrastructure/database/unitOfWork';
import { esFotoDeVehiculo, esStorageKeyPrivado, prefijoDocumentosVehiculo } from '../src/infrastructure/storage/zonaPrivada';

const existe = (ruta: string) => fs.access(ruta).then(() => true, () => false);

/** Mismo saneo que LocalStorageAdapter.save aplica al prefijo. */
const sanear = (prefijo: string) => prefijo.replace(/[^a-zA-Z0-9_-]/g, '-');

/** `vehiculos-12/2026-10/abc.pdf` → `vehiculos-docs-12/2026-10/abc.pdf` (mismo mes y nombre). */
export function claveDestino(storageKey: string, vehiculoId: number): string {
    const resto = storageKey.replace(/\\/g, '/').split('/').filter(Boolean).slice(1);
    return [sanear(prefijoDocumentosVehiculo(vehiculoId)), ...resto].join('/');
}

function dentroDe(raiz: string, rel: string): string {
    const abs = path.resolve(raiz, rel);
    if (!abs.startsWith(path.resolve(raiz) + path.sep)) throw new Error(`ruta fuera de uploads: ${rel}`);
    return abs;
}

async function main() {
    const args = process.argv.slice(2);
    const aplicar = args.includes('--aplicar');
    const iDir = args.indexOf('--dir');
    const raiz = path.resolve(iDir >= 0 ? args[iDir + 1] : process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'));

    // Todos los tenants: el script corre en el servidor, sin sesión. Se leen también las
    // filas dadas de baja: si el binario sobrevivió, igual es un documento público.
    const filas = await withAuthBypass((tx) => tx.vehiculoArchivo.findMany({
        where: { storageKey: { not: null } },
        select: { id: true, vehiculoId: true, tipo: true, url: true, storageKey: true },
        orderBy: { id: 'asc' },
    }));
    const pendientes = filas.filter((f) => !esFotoDeVehiculo(f.tipo) && !esStorageKeyPrivado(f.storageKey));

    console.log(`[migrar-documentos-vehiculos] ${raiz}`);
    console.log(`  ${filas.length} archivo(s) de vehículos con binario; ${pendientes.length} documento(s) todavía en zona pública.`);
    console.log(aplicar ? '  Modo: APLICAR (mueve archivos y actualiza filas).' : '  Modo: SIMULACIÓN (no se toca nada; agregá --aplicar).');

    let movidos = 0;
    let soloFila = 0;
    let conflictos = 0;
    const urlsViejas: string[] = [];

    for (const f of pendientes) {
        const origen = f.storageKey as string;
        const destino = claveDestino(origen, f.vehiculoId);
        const absOrigen = dentroDe(raiz, origen);
        const absDestino = dentroDe(raiz, destino);
        const hayOrigen = await existe(absOrigen);
        const hayDestino = await existe(absDestino);

        if (hayOrigen && hayDestino) {
            conflictos++;
            console.log(`  ! #${f.id}: existen ${origen} y ${destino}; no se toca (revisalo a mano).`);
            continue;
        }
        urlsViejas.push(f.url);
        console.log(`  - #${f.id} (${f.tipo}): ${origen} → ${destino}${hayOrigen ? '' : hayDestino ? ' (el archivo ya estaba movido)' : ' (sin binario en disco)'}`);
        if (!aplicar) continue;

        if (hayOrigen) {
            await fs.mkdir(path.dirname(absDestino), { recursive: true });
            await fs.rename(absOrigen, absDestino);
            movidos++;
        } else {
            soloFila++;
        }
        // Primero el binario y después la fila: si esto falla, la próxima corrida encuentra el
        // archivo ya movido y sólo actualiza la fila.
        await withAuthBypass((tx) => tx.vehiculoArchivo.update({
            where: { id: f.id },
            data: { storageKey: destino, url: `/uploads/${destino}` },
        }));
    }

    if (aplicar) {
        console.log(`  Listo: ${movidos} movido(s), ${soloFila} fila(s) actualizada(s) sin mover, ${conflictos} conflicto(s).`);
    } else if (conflictos) {
        console.log(`  ${conflictos} conflicto(s) que habría que revisar a mano.`);
    }
    if (urlsViejas.length) {
        console.log('\n  URLs viejas a purgar de la caché de Cloudflare (se sirvieron como públicas):');
        for (const u of urlsViejas) console.log(`    ${u}`);
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('[migrar-documentos-vehiculos] falló:', err instanceof Error ? err.message : err);
            process.exit(1);
        });
}
