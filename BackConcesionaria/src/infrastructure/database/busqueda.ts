import { ValidationException } from '../../domain/exceptions/BaseException';

/**
 * Búsqueda de texto libre de los listados (`?q=`) y rango de fechas.
 *
 * Antes el front filtraba EN MEMORIA la página que tenía cargada: con 20 filas
 * por página, buscar un cliente que estaba en la página 3 daba "sin resultados".
 * Ahora el filtro va en el `where` y combina con los demás filtros y la paginación
 * (`totalResults` cuenta lo que matchea).
 *
 * `q` se parte en términos por espacios y CADA término tiene que aparecer en algún
 * campo (AND de ORs): "juan perez" encuentra a Juan (nombre) Pérez (apellido) y
 * "toyota corolla" a la unidad de esa marca y modelo, cosa que un único `contains`
 * con la frase entera no logra. Es insensible a mayúsculas (ILIKE), NO a acentos:
 * la base no tiene `unaccent` y sumarlo es una migración aparte.
 *
 * `q`, `fechaDesde` y `fechaHasta` NO son columnas: cada repo los saca del filtro
 * ANTES de `coerceFilter`, que pasa toda clave al `where` (una desconocida es un
 * 500 de Prisma).
 */

/** Tope del texto y de términos: corta un `q` gigante que arme un `where` enorme. */
const MAX_LARGO = 100;
const MAX_TERMINOS = 5;
const INT_MAX = 2_147_483_647;

/** Los términos de `q`; vacío, ausente o no-texto → [] (no filtra). */
export function terminosDeBusqueda(q: unknown): string[] {
    const texto = Array.isArray(q) ? q[0] : q;
    if (typeof texto !== 'string') return [];
    return texto.trim().slice(0, MAX_LARGO).split(/\s+/).filter(Boolean).slice(0, MAX_TERMINOS);
}

const contiene = (t: string) => ({ contains: t, mode: 'insensitive' as const });

/** El cliente matchea por nombre, apellido o DNI. */
export const clienteCoincide = (t: string) => ({
    OR: [{ nombre: contiene(t) }, { apellido: contiene(t) }, { dni: contiene(t) }],
});

/** La unidad matchea por dominio (patente), marca o modelo. */
export const vehiculoCoincide = (t: string) => ({
    OR: [{ dominio: contiene(t) }, { marca: contiene(t) }, { modelo: contiene(t) }],
});

/** El término leído como número de documento ("123" o "#123"), o null. */
export function idDeTermino(t: string): number | null {
    const m = /^#?(\d{1,10})$/.exec(t);
    if (!m) return null;
    const n = Number(m[1]);
    return n > 0 && n <= INT_MAX ? n : null;
}

/**
 * Condiciones de la búsqueda para el `AND` del `where`, o null si `q` no trae
 * nada. `alternativas(t)` dice en qué campos de la entidad puede aparecer el término.
 */
export function whereDeBusqueda(
    q: unknown,
    alternativas: (termino: string) => Record<string, unknown>[],
): Record<string, unknown>[] | null {
    const terminos = terminosDeBusqueda(q);
    if (!terminos.length) return null;
    return terminos.map((t) => {
        const or = alternativas(t);
        const id = idDeTermino(t);
        if (id !== null) or.push({ id });
        return { OR: or };
    });
}

// ── Rango de fechas ─────────────────────────────────────────────────────────

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" válido (existe en el calendario) → Date a medianoche UTC; si no, null. */
function aFechaUtc(valor: string): Date | null {
    const m = FECHA.exec(valor);
    if (!m) return null;
    const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    // 2026-02-30 "existe" para Date (se corre al 2/3): se rechaza si no ida y vuelta.
    if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
    return fecha;
}

/**
 * Filtro inclusivo `{ gte, lte }` para una columna `@db.Date` a partir de
 * `fechaDesde`/`fechaHasta` ("YYYY-MM-DD", cualquiera de los dos opcional), o
 * null si no viene ninguno. Medianoche UTC es el valor que Prisma guarda para una
 * fecha sin hora, así que `lte` con el día "hasta" lo incluye.
 *
 * Una fecha mal formada es un 400 (no se ignora en silencio: "Ventas del mes" con
 * el filtro descartado contaría todas las ventas).
 */
export function rangoDeFechas(desde: unknown, hasta: unknown): { gte?: Date; lte?: Date } | null {
    const leer = (valor: unknown, campo: string, nombre: string): Date | undefined => {
        const v = Array.isArray(valor) ? valor[0] : valor;
        if (v === undefined || v === null || v === '') return undefined;
        const fecha = typeof v === 'string' ? aFechaUtc(v.trim()) : null;
        if (!fecha) {
            const mensaje = `La fecha «${nombre}» no es válida: usá el formato AAAA-MM-DD`;
            throw new ValidationException([{ campo, mensaje }], mensaje);
        }
        return fecha;
    };

    const gte = leer(desde, 'fechaDesde', 'desde');
    const lte = leer(hasta, 'fechaHasta', 'hasta');
    if (!gte && !lte) return null;
    if (gte && lte && gte > lte) {
        const mensaje = 'La fecha «desde» no puede ser posterior a la fecha «hasta»';
        throw new ValidationException([{ campo: 'fechaDesde', mensaje }], mensaje);
    }
    return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}
