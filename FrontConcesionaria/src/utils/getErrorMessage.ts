/**
 * Forma mínima de un AxiosError. Se reconoce por `isAxiosError` en vez de
 * importar la clase: este módulo lo carga queryClient desde main.tsx, y el
 * import de axios metía su chunk en la carga inicial de las pantallas públicas
 * (/capacitacion, /login), que no lo necesitan.
 */
interface ErrorDeAxios {
    isAxiosError: true;
    code?: string;
    message: string;
    response?: { status: number; data?: unknown };
}

const esErrorDeAxios = (err: unknown): err is ErrorDeAxios =>
    !!err && typeof err === 'object' && (err as { isAxiosError?: unknown }).isAxiosError === true;

/**
 * Mensajes de error que ve el usuario cuando el problema no es "de negocio" (el
 * backend no llegó a contestar con un mensaje propio). En español y en voseo:
 * nunca "Network Error", "timeout of 60000ms exceeded" ni el HTML de una página
 * de error del proxy.
 */
export const MENSAJES_ERROR = {
    red: 'No hay conexión con el servidor. Revisá tu internet y probá de nuevo.',
    timeout: 'El servidor tardó demasiado en responder. Probá de nuevo en un momento.',
    servidor: 'Hubo un problema en el servidor. Probá de nuevo en unos minutos.',
    noDisponible: 'El servidor no está disponible en este momento. Probá de nuevo en unos minutos.',
    sesionVencida: 'Tu sesión venció. Volvé a entrar.',
    sinPermiso: 'No tenés permiso para hacer esto.',
    noEncontrado: 'No encontramos lo que buscabas.',
    demasiadosIntentos: 'Hiciste muchos intentos seguidos. Esperá un momento y probá de nuevo.',
    archivoGrande: 'El archivo es demasiado grande.',
} as const;

/** Mensaje genérico por código HTTP, para respuestas sin un `message` utilizable. */
export function mensajePorEstado(status: number | undefined): string | null {
    if (status == null) return null;
    if (status === 401) return MENSAJES_ERROR.sesionVencida;
    if (status === 403) return MENSAJES_ERROR.sinPermiso;
    if (status === 404) return MENSAJES_ERROR.noEncontrado;
    if (status === 408) return MENSAJES_ERROR.timeout;
    if (status === 413) return MENSAJES_ERROR.archivoGrande;
    if (status === 429) return MENSAJES_ERROR.demasiadosIntentos;
    if (status === 502 || status === 503 || status === 504) return MENSAJES_ERROR.noDisponible;
    if (status >= 500) return MENSAJES_ERROR.servidor;
    return null;
}

/** ¿Parece HTML (la página de error de nginx/Cloudflare) y no un mensaje? */
const pareceHtml = (s: string) => /^\s*</.test(s) || /<\/?(html|body|head|title|h1|center|div)\b/i.test(s);

/**
 * Traduce los mensajes técnicos en inglés que arma axios (o el navegador) cuando
 * no hubo respuesta útil del backend. Devuelve null si el texto no es uno de esos
 * (es decir, si es un mensaje "de verdad" y se puede mostrar tal cual).
 */
export function traducirMensajeTecnico(mensaje: string): string | null {
    const m = mensaje.trim();
    if (!m) return null;
    if (pareceHtml(m)) return MENSAJES_ERROR.servidor;
    if (/^network error$/i.test(m) || /failed to fetch|load failed|networkerror/i.test(m)) return MENSAJES_ERROR.red;
    if (/timeout|timed out|ETIMEDOUT|ECONNABORTED/i.test(m)) return MENSAJES_ERROR.timeout;
    const estado = /request failed with status code (\d{3})/i.exec(m);
    if (estado) return mensajePorEstado(Number(estado[1])) ?? MENSAJES_ERROR.servidor;
    return null;
}

/** Limpia un texto candidato a mensaje: traduce lo técnico y descarta lo vacío. */
const limpiar = (texto: unknown): string | null => {
    if (typeof texto !== 'string') return null;
    const t = texto.trim();
    if (!t) return null;
    return traducirMensajeTecnico(t) ?? t;
};

/**
 * Extrae un mensaje de error legible de una respuesta de API o error de JS.
 * El cliente HTTP (api/client.ts) ya normaliza los errores a `{ error, message,
 * status }` con el texto en español; esto cubre además los AxiosError crudos,
 * los Error de JS y los strings, para que nada técnico llegue a la pantalla.
 */
export function getErrorMessage(err: unknown, fallback = 'Ocurrió un error inesperado'): string {
    if (typeof err === 'string') return limpiar(err) ?? fallback;

    if (esErrorDeAxios(err)) {
        const data = err.response?.data as { message?: unknown } | string | undefined;
        const apiMessage = typeof data === 'object' && data ? limpiar(data.message) : null;
        if (apiMessage) return apiMessage;
        if (!err.response) {
            return err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT'
                ? MENSAJES_ERROR.timeout
                : MENSAJES_ERROR.red;
        }
        return mensajePorEstado(err.response.status) ?? limpiar(err.message) ?? fallback;
    }

    if (err instanceof Error) {
        return limpiar(err.message) ?? fallback;
    }

    if (err && typeof err === 'object') {
        const o = err as { message?: unknown; error?: unknown; status?: unknown };
        const directo = limpiar(o.message);
        if (directo) return directo;
        // Forma vieja { error: { message } }.
        if (o.error && typeof o.error === 'object') {
            const anidado = limpiar((o.error as { message?: unknown }).message);
            if (anidado) return anidado;
        }
        if (typeof o.status === 'number') return mensajePorEstado(o.status) ?? fallback;
    }

    return fallback;
}
