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

export function coerceFilter(filter: any = {}, options: CoerceOptions = {}): Record<string, any> {
    const where: Record<string, any> = {};
    const numericKeys = options.numericKeys ?? [];

    for (const [key, value] of Object.entries(filter)) {
        if (value === undefined || value === null || value === '') continue;

        if (ID_KEY.test(key) || numericKeys.includes(key)) {
            const num = Number(value);
            if (!Number.isNaN(num)) {
                where[key] = num;
                continue;
            }
        }

        if (value === 'true' || value === 'false') {
            where[key] = value === 'true';
            continue;
        }

        where[key] = value;
    }

    return where;
}
