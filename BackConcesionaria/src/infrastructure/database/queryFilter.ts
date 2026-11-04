/**
 * Normaliza los filtros que llegan por query string antes de pasarlos al
 * `where` de Prisma.
 *
 * Todo query param llega como string ("?clienteId=1" -> "1"), pero las columnas
 * de tipo Int/Boolean del schema esperan number/boolean. Pasarlos crudos hace
 * que Prisma lance PrismaClientValidationError y el endpoint responda 500.
 *
 * - Las claves de id (`id`, `clienteId`, `vehiculoId`, ...) se convierten a number.
 * - "true"/"false" se convierten a boolean.
 * - Los valores vacíos se descartan, para que "?clienteId=" no filtre por nada.
 * - El resto (enums, texto) se deja igual.
 *
 * Las columnas Int que NO son ids (`anio`, `mes`, ...) no se detectan por el
 * nombre: cada repo las declara con `numericKeys`. No se convierte cualquier
 * string numérico porque hay columnas String que guardan dígitos (`dni`,
 * `dominio`, `vin`): convertirlas rompería la consulta.
 */
const ID_KEY = /(^id$|Id$)/;

export interface CoerceOptions {
    /** Columnas Int cuyo nombre no termina en `Id` (ej: ['anio', 'mes']). */
    numericKeys?: string[];
}

/**
 * Claves que nunca pueden llegar a un objeto como nombre de propiedad: con
 * `where[key] = …`, `__proto__` le cambiaría el prototipo al objeto.
 */
const CLAVES_PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

export function coerceFilter(filter: any = {}, options: CoerceOptions = {}): Record<string, any> {
    const numericKeys = options.numericKeys ?? [];
    const pares: Array<[string, unknown]> = [];

    for (const [key, value] of Object.entries(filter ?? {})) {
        if (value === undefined || value === null || value === '') continue;
        if (CLAVES_PROHIBIDAS.has(key)) continue;

        if (ID_KEY.test(key) || numericKeys.includes(key)) {
            const num = Number(value);
            if (!Number.isNaN(num)) {
                pares.push([key, num]);
                continue;
            }
        }

        if (value === 'true' || value === 'false') {
            pares.push([key, value === 'true']);
            continue;
        }

        pares.push([key, value]);
    }

    // Object.fromEntries crea propiedades PROPIAS (aun con una clave rara no toca el
    // prototipo) en vez de asignar `where[key]` con una clave que viene del query string.
    return Object.fromEntries(pares);
}

/**
 * Columna de orden: la pedida SOLO si está en la lista permitida; si no, el default.
 * Devuelve el elemento de la LISTA, no el valor del request: la clave del `orderBy`
 * nunca sale directo del query string.
 */
export function claveDeOrden<T extends string>(permitidas: readonly T[], pedida: unknown, porDefecto: T): T {
    const texto = String(pedida);
    return permitidas.find((k) => k === texto) ?? porDefecto;
}
