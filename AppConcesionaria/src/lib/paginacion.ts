/**
 * Respuesta paginada del backend. La mayoría manda `totalResults`; la de
 * atenciones manda `total`. Las dos traen `page` y `totalPages`.
 */
export interface Paginado<T> {
    results: T[];
    page?: number | string;
    limit?: number | string;
    totalPages?: number | string;
    totalResults?: number;
    total?: number;
}

/** Número de la página siguiente, o `undefined` si ya no hay más. */
export function siguientePagina(ultima: Paginado<unknown>, pedida: number, limite: number): number | undefined {
    const page = Number(ultima.page ?? pedida);
    const totalPages = Number(ultima.totalPages);
    if (Number.isFinite(totalPages) && totalPages > 0) return page < totalPages ? page + 1 : undefined;
    // Sin `totalPages`: si la página vino llena, puede haber otra.
    return ultima.results.length >= limite ? page + 1 : undefined;
}

/** Total de resultados según lo que mande el endpoint (o `undefined`). */
export const totalDe = (p: Paginado<unknown> | undefined): number | undefined =>
    p ? (p.totalResults ?? p.total) : undefined;
