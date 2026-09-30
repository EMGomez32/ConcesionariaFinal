import { Prisma } from '@prisma/client';

/**
 * Parseo defensivo de paginación y orden a partir del query string.
 *
 * Antes cada repo hacía `take: Number(limit)` y `orderBy: { [sortBy]: sortOrder }`
 * con lo que mandara el cliente: `?limit=1000000` traía toda la tabla (con sus
 * `include`) en una request, `?sortBy=passwordHash` ordenaba por una columna
 * sensible (oráculo de orden) y un `sortBy` inválido o un `limit` negativo eran un
 * 500 de Prisma.
 */

/**
 * Tope de filas por página. El frontend hoy pide hasta `limit=2000` en varias
 * pantallas (listas completas para filtrar/armar selects del lado del cliente), así
 * que 2000 es el piso para no truncar nada en silencio. Sigue cortando el abuso
 * (`limit=1000000`). Bajarlo va de la mano de paginar esas pantallas del lado del
 * servidor.
 */
export const MAX_PAGE_SIZE = 2000;

/** Tope de página: con MAX_PAGE_SIZE el `skip` máximo (≈2·10⁹) entra en un Int de 32 bits. */
const MAX_PAGE = 1_000_000;

export interface Paginacion {
    limit: number;
    page: number;
    skip: number;
}

const aEnteroPositivo = (v: unknown): number | null => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n > 0 ? n : null;
};

/** `limit` inválido, cero o negativo → default; por encima del tope → tope. */
export function parsePagination(
    options: { limit?: unknown; page?: unknown } = {},
    { defaultLimit = 20, maxLimit = MAX_PAGE_SIZE }: { defaultLimit?: number; maxLimit?: number } = {},
): Paginacion {
    const limit = Math.min(aEnteroPositivo(options.limit) ?? defaultLimit, maxLimit);
    const page = Math.min(aEnteroPositivo(options.page) ?? 1, MAX_PAGE);
    return { limit, page, skip: (page - 1) * limit };
}

// Columnas cuyo nombre sugiere un secreto: nunca se ordena por ellas, aunque sean
// escalares del modelo (passwordHash, tokenHash, secretos de integraciones, etc.).
const SENSIBLE = /hash|password|secret|token/i;

const cacheColumnas = new Map<string, Set<string>>();

/** Columnas escalares (no relaciones ni listas) del modelo, sin las sensibles. */
function columnasOrdenables(model: string): Set<string> {
    let cols = cacheColumnas.get(model);
    if (!cols) {
        const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
        cols = new Set(
            (m?.fields ?? [])
                .filter((f) => f.kind === 'scalar' && !f.isList && !SENSIBLE.test(f.name))
                .map((f) => f.name),
        );
        cacheColumnas.set(model, cols);
    }
    return cols;
}

/**
 * `orderBy` seguro: sólo columnas escalares del modelo que no sean sensibles. Un
 * `sortBy` desconocido (relación, columna inexistente, `passwordHash`…) cae al
 * `fallback` en vez de tirar un 500 o filtrar un orden por un secreto.
 */
export function parseOrderBy(
    model: string,
    sortBy: unknown,
    sortOrder: unknown,
    fallback = 'createdAt',
): Record<string, 'asc' | 'desc'> {
    const cols = columnasOrdenables(model);
    const key = typeof sortBy === 'string' && cols.has(sortBy) ? sortBy : fallback;
    return { [key]: sortOrder === 'asc' ? 'asc' : 'desc' };
}
