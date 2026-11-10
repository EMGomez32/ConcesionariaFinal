import axios, { type AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { queryClient } from './queryClient';
import {
    useAuthStore,
    AUTH_STORAGE_KEY,
    decodeJwtPayload,
    leerRefreshHeredado,
    olvidarRefreshHeredado,
    type User,
} from '../store/authStore';
import { guardarRegreso, marcarAvisoLogin, avisarOtrasPestanas, escucharOtrasPestanas, type AvisoLogin } from '../store/sesion';
import { MENSAJES_ERROR, mensajePorEstado, traducirMensajeTecnico } from '../utils/getErrorMessage';
import type { ApiErrorShape } from '../utils/error';

declare module 'axios' {
    interface AxiosRequestConfig {
        /**
         * Devuelve la AxiosResponse completa en vez de sólo `data`. Necesario
         * cuando importa un header de la respuesta (p.ej. el Content-Disposition
         * de una descarga), que el interceptor de abajo si no descarta.
         */
        rawResponse?: boolean;
    }
}

const API_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Cabecera con la que el front se identifica como la WEB. Con ella el backend no manda
 * el refresh token en ningún cuerpo (login, 2FA, refresh): queda sólo en la cookie
 * httpOnly, fuera del alcance del JS de la página. La lleva TODA request de este
 * cliente, incluido el /auth/refresh "pelado" de abajo. La app móvil no la manda y
 * sigue recibiendo el refresh en el cuerpo.
 */
export const CABECERA_CLIENTE_WEB = { 'X-Autenza-Cliente': 'web' } as const;

const axiosInstance = axios.create({
    baseURL: API_URL,
    // La cookie httpOnly del refresh (`autenza_rt`, Path=/api/auth) tiene que viajar
    // también cuando el front y la API están en orígenes distintos (desarrollo).
    withCredentials: true,
    // Sin tope, una request colgada (red móvil, proxy caído) dejaba la pantalla
    // cargando para siempre. 60 s cubre reportes y PDFs pesados; quien suba
    // archivos grandes puede pasar su propio `timeout`.
    timeout: 60_000,
    headers: {
        'Content-Type': 'application/json',
        ...CABECERA_CLIENTE_WEB,
    },
});

axiosInstance.interceptors.request.use(
    (config) => {
        const { accessToken } = useAuthStore.getState();
        if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

/* ───────────────────────────────────────────────────────────────────────────
 * Refresh de la sesión
 *
 * El refresh token vive en una cookie httpOnly que pone el backend: el front no
 * lo lee, no lo manda y tampoco lo recibe en ningún cuerpo (X-Autenza-Cliente: web);
 * sólo tiene el access token, en memoria. /auth/refresh rota la
 * cookie en cada uso y tiene detección de reuso (revokeAllForUser): si dos
 * requests mandan el MISMO refresh, el segundo revoca todas las sesiones →
 * logout espurio. Por eso:
 *
 *  1. Single-flight por pestaña: una sola promesa compartida a nivel módulo. Las
 *     requests que dan 401 en paralelo se suscriben a ese mismo refresh.
 *  2. Exclusión ENTRE pestañas con Web Locks: sólo una pestaña ejecuta
 *     /auth/refresh a la vez. Cuando la siguiente entra, la cookie ya es la rotada
 *     (el navegador la actualizó con la respuesta anterior), así que nunca se
 *     reusa una revocada. Antes esto se lograba releyendo el refresh de
 *     localStorage; ahora lo resuelve la cookie, que es una sola para todas.
 *  3. BroadcastChannel: la pestaña que renovó comparte el access token nuevo. Si
 *     otra pestaña estaba esperando el lock, usa ése y no rota otra vez.
 *  4. Evento `storage` sobre la clave del usuario: si en otra pestaña se cerró la
 *     sesión, ésta también; si se entró con OTRA cuenta, ésta se recarga.
 * Sin Web Locks degrada al single-flight por pestaña.
 * ─────────────────────────────────────────────────────────────────────────── */

let refreshPromise: Promise<string> | null = null;
/** Último access token que llegó de otra pestaña (y cuándo). */
let renovadoAfuera: { access: string; en: number } | null = null;

escucharOtrasPestanas((msg) => {
    const { user } = useAuthStore.getState();
    if (!user) return;
    if (msg.userId != null && msg.userId !== user.id) return;
    renovadoAfuera = { access: msg.access, en: Date.now() };
    useAuthStore.getState().setAccessToken(msg.access);
});

if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key !== AUTH_STORAGE_KEY) return;
        const actual = useAuthStore.getState().user;
        if (!actual) return; // pestaña sin sesión (login, capacitación): no hay nada que sincronizar
        let otro: User | null;
        try { otro = (JSON.parse(e.newValue ?? 'null') as { state?: { user?: User | null } } | null)?.state?.user ?? null; } catch { return; }
        if (!otro) {
            // Se cerró la sesión en otra pestaña: acá también (el backend ya revocó la cookie).
            useAuthStore.getState().logout();
            queryClient.clear();
        } else if (otro.id !== actual.id) {
            // Se entró con otra cuenta en otra pestaña: la cookie ahora es de ese usuario.
            window.location.reload();
        } else {
            // Mismo usuario con datos actualizados (nombre, 2FA): se sincroniza.
            useAuthStore.setState({ user: otro });
        }
    });
}

async function performRefresh(): Promise<string> {
    // La primera vez después del deploy, el refresh del storage viejo migra la sesión
    // a la cookie (el backend lo acepta en el cuerpo). Después, cuerpo vacío: cookie.
    const heredado = leerRefreshHeredado();
    let response: AxiosResponse<{ access: string }>;
    try {
        // axios "pelado" (no axiosInstance) → no re-entra en el interceptor de abajo.
        // Con la cabecera web: la respuesta trae sólo el access; el refresh rotado
        // llega en la cookie.
        response = await axios.post(`${API_URL}/auth/refresh`, heredado ? { refreshToken: heredado } : {}, {
            withCredentials: true,
            timeout: 20_000,
            headers: { ...CABECERA_CLIENTE_WEB },
        });
    } catch (err) {
        // Si el backend contestó (aunque sea rechazándolo), el heredado ya no sirve.
        if ((err as AxiosError)?.response) olvidarRefreshHeredado();
        throw err;
    }
    olvidarRefreshHeredado();
    const { access } = response.data;
    const payload = decodeJwtPayload(access);
    const { user } = useAuthStore.getState();
    if (user && payload?.userId != null && payload.userId !== user.id) {
        // La cookie es de OTRO usuario (se entró con otra cuenta en otra pestaña y el
        // evento storage no llegó). Recargar adopta esa sesión sin mezclar datos; la
        // promesa queda pendiente a propósito para que nadie siga con este token.
        window.location.reload();
        return new Promise<string>(() => {});
    }
    useAuthStore.getState().setAccessToken(access);
    avisarOtrasPestanas({ tipo: 'renovada', access, userId: payload?.userId });
    return access;
}

async function runExclusiveRefresh(): Promise<string> {
    const pedidoEn = Date.now();
    const tarea = async () => {
        // Mientras se esperaba el lock, otra pestaña pudo renovar: su access sirve igual
        // y rotar de nuevo sería gastar otra vuelta de refresh.
        if (renovadoAfuera && renovadoAfuera.en >= pedidoEn) return renovadoAfuera.access;
        return performRefresh();
    };
    if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.request) {
        // `await` desenrolla el Promise<Promise<string>> que tipa LockManager.request.
        return await navigator.locks.request('autenza-auth-refresh', tarea);
    }
    return tarea();
}

function refreshAccessToken(): Promise<string> {
    if (!refreshPromise) {
        refreshPromise = runExclusiveRefresh().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
}

/**
 * ¿El backend RECHAZÓ la sesión (refresh vencido, revocado o ausente)? Sólo
 * entonces se cierra la sesión. Un corte de red, un 5xx (backend caído detrás
 * del proxy) o un 429 son pasajeros: cerrar la sesión por eso echaba a la gente
 * en medio del trabajo.
 */
const sesionRechazada = (err: unknown): boolean => {
    const status = (err as AxiosError)?.response?.status;
    return status === 400 || status === 401 || status === 403;
};

/**
 * Qué decirle en el login: si la sesión llegó a su duración máxima desde el login
 * (SESION_MAXIMA_VENCIDA), eso; si no, el "tu sesión venció" de siempre.
 */
const avisoPorRechazo = (err: unknown): AvisoLogin =>
    (err as AxiosError<{ error?: string }>)?.response?.data?.error === 'SESION_MAXIMA_VENCIDA' ? 'sesion-maxima' : 'sesion-vencida';

/**
 * La sesión venció: se recuerda dónde estaba el usuario y el aviso para el login,
 * se limpia el estado y (si se pide) se va a /login. El href recarga la página
 * (heap nuevo → caché nuevo); el clear() es defensa en profundidad por si algún
 * día esto pasa a ser navegación SPA (los datos del usuario saliente no deben
 * sobrevivir en el QueryClient).
 */
function sesionVencida({ irAlLogin, aviso = 'sesion-vencida' }: { irAlLogin: boolean; aviso?: AvisoLogin }) {
    const { pathname, search } = window.location;
    guardarRegreso(pathname + search);
    marcarAvisoLogin(aviso);
    useAuthStore.getState().logout();
    queryClient.clear();
    if (irAlLogin && !pathname.startsWith('/login')) window.location.assign('/login');
}

export type ResultadoRestauracion = 'ok' | 'vencida' | 'sin-conexion';

/**
 * Restaura la sesión al arrancar: hay usuario persistido pero no access token
 * (vive en memoria, se perdió al recargar). Pide /auth/refresh con la cookie.
 *  - 'ok': hay access token nuevo.
 *  - 'vencida': el backend rechazó la cookie → estado limpio + aviso en el login.
 *  - 'sin-conexion': no se pudo preguntar (red, backend caído); la sesión NO se
 *    toca y se puede reintentar.
 */
export async function restaurarSesion(): Promise<ResultadoRestauracion> {
    const { user, isAuthenticated } = useAuthStore.getState();
    if (!user) return 'vencida';
    if (isAuthenticated) return 'ok';
    try {
        await refreshAccessToken();
        return 'ok';
    } catch (err) {
        if (!sesionRechazada(err)) return 'sin-conexion';
        sesionVencida({ irAlLogin: false, aviso: avisoPorRechazo(err) });
        return 'vencida';
    }
}

/* ───────────────────────────────────────────────────────────────────────────
 * Normalización de errores
 *
 * Todo error que sale de este cliente tiene la forma ApiErrorShape con un
 * `message` en español apto para mostrar. Antes se rechazaba `response.data` o
 * `error.message` crudos: un corte de red llegaba a la pantalla como "Network
 * Error" y un 502 del proxy como el HTML de la página de nginx.
 * ─────────────────────────────────────────────────────────────────────────── */

async function normalizarError(error: unknown): Promise<unknown> {
    // La cancelación (AbortController de React Query al desmontar) se deja pasar
    // tal cual: React Query la reconoce y no la trata como falla.
    if (axios.isCancel(error)) return error;
    const e = error as AxiosError;
    if (!e?.isAxiosError) return error;

    if (!e.response) {
        const esTimeout = e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT';
        const r: ApiErrorShape = esTimeout
            ? { error: 'TIMEOUT', message: MENSAJES_ERROR.timeout }
            : { error: 'NETWORK_ERROR', message: MENSAJES_ERROR.red };
        return r;
    }

    const status = e.response.status;
    let data: unknown = e.response.data;
    // Descargas (responseType: 'blob'): el error JSON del backend viene dentro del Blob.
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
        try { data = JSON.parse(await data.text()); } catch { data = null; }
    } else if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { /* HTML o texto plano: se descarta abajo */ }
    }

    if (data && typeof data === 'object' && !Array.isArray(data)) {
        const d = data as Record<string, unknown>;
        let message = typeof d.message === 'string' ? d.message.trim() : '';
        // El 500 genérico del backend ("Ha ocurrido un error inesperado.") y los
        // mensajes técnicos se reemplazan por el texto del sistema.
        const tecnico = message ? traducirMensajeTecnico(message) : null;
        if (!message || tecnico || d.error === 'INTERNAL_SERVER_ERROR') {
            message = mensajePorEstado(status) ?? tecnico ?? 'No se pudo completar la operación.';
        }
        return { ...d, message, status };
    }

    const r: ApiErrorShape = {
        error: `HTTP_${status}`,
        message: mensajePorEstado(status) ?? 'No se pudo completar la operación.',
        status,
    };
    return r;
}

/** Rutas de auth en las que un 401 es la respuesta (credenciales, código), no una sesión vencida. */
const RUTAS_SIN_REFRESH = /\/auth\/(login|refresh|logout|forgot-password|reset-password)(\/|\?|$)/;

axiosInstance.interceptors.response.use(
    (response) => (response.config?.rawResponse ? response : response.data),
    async (error) => {
        const originalRequest = error.config;
        const url: string = originalRequest?.url || '';

        if (
            error.response?.status === 401 &&
            originalRequest &&
            !originalRequest._retry &&
            !RUTAS_SIN_REFRESH.test(url) &&
            useAuthStore.getState().user
        ) {
            originalRequest._retry = true;
            try {
                const access = await refreshAccessToken();
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${access}`;
                return axiosInstance(originalRequest);
            } catch (refreshError) {
                if (!sesionRechazada(refreshError)) {
                    // No se pudo renovar por un problema pasajero: la sesión sigue y la
                    // request falla con el motivo real (sin conexión, servidor caído).
                    return Promise.reject(await normalizarError(refreshError));
                }
                sesionVencida({ irAlLogin: true, aviso: avisoPorRechazo(refreshError) });
                const r: ApiErrorShape = { error: 'SESION_VENCIDA', message: MENSAJES_ERROR.sesionVencida, status: 401 };
                return Promise.reject(r);
            }
        }

        // El rol de este usuario pasó a exigir 2FA (o su sesión es anterior a la política) y todavía no
        // lo activó: el backend sólo le deja usar /api/auth/*. Se lo manda a activarlo.
        if (
            error.response?.status === 403 &&
            error.response?.data?.error === 'MFA_ENROLLMENT_REQUIRED' &&
            !window.location.pathname.startsWith('/activar-2fa')
        ) {
            useAuthStore.getState().setUser({ mfaPendiente: true });
            window.location.assign('/activar-2fa');
        }

        return Promise.reject(await normalizarError(error));
    }
);

// The response interceptor unwraps `response.data`, so every call resolves
// to the response body directly. This wrapper aligns the static types with
// that runtime behavior (Promise<T> instead of Promise<AxiosResponse<T>>).
const client = {
    get: <T>(url: string, config?: AxiosRequestConfig) =>
        axiosInstance.get<T, T>(url, config),
    /** GET que conserva la respuesta completa (headers incluidos). */
    getRaw: <T>(url: string, config?: AxiosRequestConfig) =>
        axiosInstance.get<T, AxiosResponse<T>>(url, { ...config, rawResponse: true }),
    post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
        axiosInstance.post<T, T>(url, data, config),
    patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
        axiosInstance.patch<T, T>(url, data, config),
    put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
        axiosInstance.put<T, T>(url, data, config),
    delete: <T>(url: string, config?: AxiosRequestConfig) =>
        axiosInstance.delete<T, T>(url, config),
};

export default client;
