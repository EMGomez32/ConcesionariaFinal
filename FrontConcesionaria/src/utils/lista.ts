/**
 * Extrae el array de una respuesta del API, sea cual sea su forma.
 *
 * El interceptor de axios (api/client.ts:23) ya devuelve el body, pero los
 * módulos del backend no responden todos igual:
 *   - `/gastos-fijos`             -> { results, page, totalPages, ... }
 *   - `/sucursales`               -> { success: true, data: [...] }
 *   - `/gastos-fijos-categorias`  -> [...]  (array pelado)
 *
 * Escribir el desenvoltorio a mano en cada página es lo que hacía que los
 * selects quedaran vacíos sin ningún error visible. Mientras el backend no
 * unifique el contrato, esta función es el único lugar donde se decide.
 */
export function getList<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];

    const o = (res ?? {}) as {
        results?: T[];
        data?: T[] | { results?: T[] };
    };

    if (Array.isArray(o.results)) return o.results;
    if (Array.isArray(o.data)) return o.data;

    const anidado = (o.data as { results?: T[] } | undefined)?.results;
    return Array.isArray(anidado) ? anidado : [];
}
