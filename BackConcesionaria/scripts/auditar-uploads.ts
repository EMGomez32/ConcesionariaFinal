/**
 * Auditoría de SOLO LECTURA de los archivos ya subidos (UPLOADS_DIR).
 *
 * Los archivos anteriores a la validación por contenido pudieron entrar con cualquier
 * extensión (se tomaba del nombre que mandaba el cliente) y con un tipo que no era el
 * declarado. Este script los recorre, NO modifica ni borra nada, e informa:
 *   - extensiones peligrosas (.html, .svg, .js, .php, .exe…);
 *   - archivos cuyo CONTENIDO no coincide con ningún tipo permitido;
 *   - archivos cuya extensión no corresponde a lo que realmente son.
 *
 * USO (en el servidor, dentro del contenedor del backend):
 *   docker compose exec -T backend npx ts-node scripts/auditar-uploads.ts [directorio]
 * Sale con código 1 si encontró algo sospechoso (sirve para un chequeo periódico).
 */
import fs from 'fs/promises';
import path from 'path';
import { detectarTipoArchivo } from '../src/infrastructure/security/contenidoArchivo';

const EXTENSIONES_PELIGROSAS = new Set([
    'html', 'htm', 'xhtml', 'svg', 'xml', 'js', 'mjs', 'php', 'phtml', 'jsp', 'asp', 'aspx', 'exe', 'dll', 'bat', 'cmd',
    'sh', 'ps1', 'jar', 'msi', 'com', 'scr', 'vbs', 'swf',
]);

// Extensiones que se aceptan como equivalentes de un mismo tipo.
const EQUIVALENTES: Record<string, string[]> = {
    jpg: ['jpg', 'jpeg'],
    heic: ['heic', 'heif'],
    heif: ['heic', 'heif'],
    txt: ['txt', 'text', 'log', 'csv'],
    csv: ['csv', 'txt'],
};

interface Hallazgo { archivo: string; motivo: string }

async function* recorrer(dir: string): AsyncGenerator<string> {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const ruta = path.join(dir, e.name);
        if (e.isDirectory()) yield* recorrer(ruta);
        else if (e.isFile()) yield ruta;
    }
}

async function main() {
    const raiz = path.resolve(process.argv[2] || process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'));
    await fs.access(raiz).catch(() => { throw new Error(`No existe el directorio: ${raiz}`); });

    const hallazgos: Hallazgo[] = [];
    let total = 0;

    for await (const ruta of recorrer(raiz)) {
        total++;
        const rel = path.relative(raiz, ruta).replace(/\\/g, '/');
        const ext = path.extname(ruta).slice(1).toLowerCase();

        if (EXTENSIONES_PELIGROSAS.has(ext)) {
            hallazgos.push({ archivo: rel, motivo: `extensión peligrosa (.${ext})` });
            continue;
        }

        const buf = await fs.readFile(ruta);
        // Se pasa un mime "amigable" a los tipos ambiguos (doc/xls, txt/csv) según la extensión.
        const mimeSegunExt = ext === 'doc' ? 'application/msword' : ext === 'xls' ? 'application/vnd.ms-excel' : ext === 'csv' ? 'text/csv' : 'text/plain';
        const tipo = detectarTipoArchivo(buf, mimeSegunExt);
        if (!tipo) {
            hallazgos.push({ archivo: rel, motivo: 'el contenido no corresponde a ningún tipo permitido' });
            continue;
        }
        const aceptadas = EQUIVALENTES[tipo.ext] ?? [tipo.ext];
        if (!aceptadas.includes(ext)) {
            hallazgos.push({ archivo: rel, motivo: `la extensión .${ext || '(ninguna)'} no coincide con el contenido (${tipo.mime})` });
        }
    }

    console.log(`[auditar-uploads] ${raiz}: ${total} archivo(s) revisado(s), ${hallazgos.length} sospechoso(s).`);
    for (const h of hallazgos) console.log(`  - ${h.archivo}: ${h.motivo}`);
    if (hallazgos.length > 0) {
        console.log('\nNo se modificó nada. Revisá cada archivo antes de borrarlo o moverlo.');
        process.exit(1);
    }
}

main().catch((e) => {
    console.error('[auditar-uploads] falló:', e instanceof Error ? e.message : e);
    process.exit(2);
});
