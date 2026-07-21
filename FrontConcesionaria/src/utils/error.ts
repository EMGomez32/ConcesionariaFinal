/**
 * Forma típica de los errores que la API o axios devuelven al frontend.
 * - `error.message` viene del backend cuando aplica el estandar (ApiError serialization)
 * - `message` directo viene de network errors / axios
 */
export interface ApiErrorShape {
    error?: { message?: string; code?: string };
    message?: string;
}

/**
 * Extrae un mensaje de error legible desde un valor unknown.
 * Reemplaza el patrón repetitivo `catch (err: any) { e?.error?.message || e?.message || ... }`.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Ocurrió un error'): string {
    if (!err) return fallback;
    const e = err as ApiErrorShape;
    return e?.error?.message || e?.message || fallback;
}

/** Type guard útil para narrowing manual cuando se necesita más que el message. */
export function isApiError(err: unknown): err is ApiErrorShape {
    return typeof err === 'object' && err !== null && ('error' in err || 'message' in err);
}
