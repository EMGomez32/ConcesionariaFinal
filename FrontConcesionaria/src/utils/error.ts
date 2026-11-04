import { getErrorMessage } from './getErrorMessage';

/**
 * Forma de los errores que el cliente HTTP (api/client.ts) rechaza al frontend:
 * - `error`: código del backend ('VALIDATION_ERROR', 'CONFLICT'…) o uno del
 *   cliente ('NETWORK_ERROR', 'TIMEOUT', 'SESION_VENCIDA', 'HTTP_502'…).
 * - `message`: SIEMPRE un texto en español apto para mostrar.
 * - `status`: código HTTP (ausente si no hubo respuesta).
 * - `details`: el detalle de validación del backend, si vino.
 * La forma vieja `{ error: { message, code } }` se sigue aceptando.
 */
export interface ApiErrorShape {
    error?: string | { message?: string; code?: string };
    message?: string;
    status?: number;
    details?: unknown;
    correlationId?: string;
}

/**
 * Extrae un mensaje de error legible desde un valor unknown.
 * Reemplaza el patrón repetitivo `catch (err: any) { e?.error?.message || e?.message || ... }`.
 * Comparte la limpieza de getErrorMessage: nunca devuelve "Network Error" ni HTML crudo.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Ocurrió un error'): string {
    if (!err) return fallback;
    return getErrorMessage(err, fallback);
}

/** Type guard útil para narrowing manual cuando se necesita más que el message. */
export function isApiError(err: unknown): err is ApiErrorShape {
    return typeof err === 'object' && err !== null && ('error' in err || 'message' in err);
}
