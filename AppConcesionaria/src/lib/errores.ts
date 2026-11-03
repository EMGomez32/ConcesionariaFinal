/**
 * Mensajes de error legibles, sin depender de axios (función pura: se prueba
 * desde node). Regla: el usuario nunca ve "Network Error" ni un error en inglés.
 */

export const SIN_CONEXION = 'Sin conexión. Revisá tu internet.';
export const SESION_VENCIDA = 'Tu sesión venció. Iniciá sesión de nuevo.';

interface ErrorHttp {
    isAxiosError?: boolean;
    code?: string;
    message?: string;
    response?: { status?: number; data?: { message?: unknown; error?: unknown } };
}

/** Errores de transporte que dicen "no hay red" (axios, fetch de RN y del navegador). */
const ES_RED = /network|failed to fetch|internet|offline/i;
/** Mensajes técnicos que nunca se muestran tal cual. */
const ES_TECNICO = /network|timeout|request failed|failed to fetch|status code|undefined|null|cannot read/i;

/** true si el error es de red (no llegó respuesta del servidor). */
export const esErrorDeRed = (e: unknown): boolean => {
    const x = e as ErrorHttp | null;
    if (!x || x.response) return false;
    if (x.code === 'ERR_NETWORK') return true;
    return ES_RED.test(x.message ?? '');
};

/** Mensaje para mostrar al usuario a partir de cualquier error. */
export function mensajeDeError(e: unknown, fallback = 'Algo salió mal. Probá de nuevo.'): string {
    const x = e as ErrorHttp | null;
    if (x?.response) {
        const msg = x.response.data?.message;
        if (typeof msg === 'string' && msg.trim()) return msg;
        const st = x.response.status ?? 0;
        if (st === 401) return SESION_VENCIDA;
        if (st === 403) return 'No tenés permiso para hacer esto.';
        if (st === 404) return 'No lo encontramos. Puede que lo hayan borrado.';
        if (st === 429) return 'Hiciste muchos intentos seguidos. Esperá un momento y probá de nuevo.';
        if (st >= 500) return 'El servidor tuvo un problema. Probá de nuevo en un rato.';
        return fallback;
    }
    if (x?.code === 'ECONNABORTED' || x?.code === 'ETIMEDOUT') {
        return 'El servidor tardó demasiado en responder. Probá de nuevo.';
    }
    if (esErrorDeRed(e)) return SIN_CONEXION;
    // Errores propios con un mensaje ya en español (p. ej. los del login).
    const m = x?.message;
    if (typeof m === 'string' && m.trim() && !ES_TECNICO.test(m)) return m;
    return fallback;
}

/**
 * Si el refresh del token falló, ¿hay que cerrar la sesión? Sólo cuando el
 * servidor dice que el token no sirve (401/400). Sin red, con el servidor caído
 * (5xx) o con el límite de intentos (429), la sesión sigue: se reintenta después.
 */
export const refreshInvalidaSesion = (status: number | undefined): boolean =>
    status === 401 || status === 400;

/** Errores del lado del cliente (4xx): reintentarlos no cambia nada. */
export const esErrorDeCliente = (e: unknown): boolean => {
    const st = (e as ErrorHttp | null)?.response?.status ?? 0;
    return st >= 400 && st < 500;
};
