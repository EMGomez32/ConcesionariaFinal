import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guarda el CONTRATO entre dos cosas que se escriben en lenguajes distintos y
 * tienen que coincidir carácter por carácter:
 *
 *   1. el backfill SQL de la migración `conversaciones_multicanal`, que le puso
 *      `clave_hilo` a las conversaciones de WhatsApp que ya existían en
 *      producción;
 *   2. `claveHiloDe()` en conversacionService.ts, que arma la misma clave para
 *      cada mensaje nuevo.
 *
 * Si los dos formatos difieren aunque sea en un prefijo, el próximo mensaje de
 * un contacto que YA tenía hilo no lo encuentra (busca por [canal, claveHilo]) y
 * abre uno nuevo: la bandeja viva se parte en dos y el historial queda huérfano.
 * No hay forma de que un test de integración lo agarre —haría falta una base con
 * datos previos a la migración—, así que se fija acá, sobre el texto.
 *
 * Ya pasó una vez durante el desarrollo: el SQL decía `'wa:' || cuenta || ':' ||
 * telefono` y el código `${cuenta}:${telefono}`.
 */

const RAIZ = join(__dirname, '..', '..');

const SQL_MIGRACION = readFileSync(
    join(RAIZ, 'prisma', 'migrations', '20260825120000_conversaciones_multicanal', 'migration.sql'),
    'utf8',
);

const FUENTE_SERVICE = readFileSync(
    join(RAIZ, 'src', 'application', 'services', 'conversacionService.ts'),
    'utf8',
);

/** El UPDATE del backfill, sin comentarios ni saltos de línea. */
const backfillDeClaveHilo = (): string => {
    const sinComentarios = SQL_MIGRACION.split('\n')
        .filter((linea) => !linea.trimStart().startsWith('--'))
        .join('\n');
    const update = sinComentarios.match(/UPDATE "conversaciones"\s+SET "clave_hilo"[\s\S]*?;/);
    if (!update) throw new Error('La migración perdió el UPDATE que llena clave_hilo');
    return update[0].replace(/\s+/g, ' ');
};

describe('migración conversaciones_multicanal: backfill de clave_hilo', () => {
    it('deja explícito el canal whatsapp en las filas existentes', () => {
        expect(SQL_MIGRACION).toMatch(/UPDATE "conversaciones" SET "canal" = 'whatsapp'/);
    });

    it('arma la clave como <whatsapp_cuenta_id>:<telefono>, sin prefijo', () => {
        const update = backfillDeClaveHilo();

        // Las dos columnas, en ese orden, unidas por ':'.
        const posCuenta = update.indexOf('"whatsapp_cuenta_id"');
        const posTelefono = update.indexOf('"telefono"');
        expect(posCuenta).toBeGreaterThan(-1);
        expect(posTelefono).toBeGreaterThan(posCuenta);
        expect(update).toContain("|| ':' ||");

        // Ningún literal que agregue un prefijo/sufijo al armado. Los únicos
        // literales admitidos son el separador y los COALESCE de emergencia,
        // que sólo disparan sobre filas imposibles (ambas columnas eran NOT NULL).
        const literales = update.match(/'[^']*'/g) ?? [];
        const inesperados = literales.filter(
            (l) => ![`':'`, `'sin-cuenta'`, `'sin-telefono-'`, `''`].includes(l),
        );
        expect(inesperados).toEqual([]);
    });

    it('el UPDATE toca TODAS las filas, incluidas las borradas por soft-delete', () => {
        // Una conversación soft-deleted sigue ocupando el índice único, así que
        // también necesita su clave o el CREATE UNIQUE INDEX falla.
        expect(backfillDeClaveHilo()).not.toMatch(/deleted_at/);
    });

    it('clave_hilo entra NULLABLE y recién se marca NOT NULL después del backfill', () => {
        const posColumna = SQL_MIGRACION.indexOf('ADD COLUMN     "clave_hilo" TEXT');
        const posBackfill = SQL_MIGRACION.indexOf('SET "clave_hilo"');
        const posNotNull = SQL_MIGRACION.indexOf('ALTER COLUMN "clave_hilo" SET NOT NULL');

        expect(posColumna).toBeGreaterThan(-1);
        expect(posBackfill).toBeGreaterThan(posColumna);
        expect(posNotNull).toBeGreaterThan(posBackfill);
        // Agregarla NOT NULL de una haría fallar la migración con filas presentes.
        expect(SQL_MIGRACION).not.toContain('ADD COLUMN     "clave_hilo" TEXT NOT NULL');
    });

    it('el código deriva la clave de WhatsApp con el mismo formato', () => {
        // No se importa conversacionService a propósito: arrastraría el cliente de
        // Prisma y a Baileys a un test que sólo mira un formato de string. Se lee
        // el template literal que devuelve claveHiloDe y se compara su FORMA.
        const plantilla = FUENTE_SERVICE.match(
            /export function claveHiloDe\([\s\S]*?return\s+`([^`]*)`/,
        )?.[1];
        if (plantilla === undefined) {
            throw new Error(
                'conversacionService ya no exporta claveHiloDe devolviendo un template literal. ' +
                'Si cambió el formato de clave_hilo, hay que escribir una migración que reescriba ' +
                'la columna en las filas viejas ANTES de tocar el código.',
            );
        }

        // `${a}:${b}` → dos interpolaciones, separadas por ':' y nada más.
        const trozos = plantilla.split(/\$\{[^}]*\}/);
        const interpolaciones = plantilla.match(/\$\{([^}]*)\}/g) ?? [];
        expect(interpolaciones).toHaveLength(2);
        expect(trozos).toEqual(['', ':', '']);
        expect(interpolaciones[0]).toMatch(/cuenta/i);
        expect(interpolaciones[1]).toMatch(/telefono/i);
    });
});
