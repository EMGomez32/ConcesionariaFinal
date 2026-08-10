import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { useAuthStore, getPersistedRefreshToken } from '../store/authStore';

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

const axiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
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

// Single-flight del refresh: una sola promesa compartida a nivel módulo. Cuando el
// access token vence y varias requests disparan 401 en paralelo, TODAS se suscriben
// a este mismo refresh en vez de llamar cada una a /auth/refresh con el mismo
// refresh token. Sin esto: el backend ROTA el refresh en cada uso y tiene detección
// de reuso (revokeAllForUser), así que el 2º request usaría un token ya rotado →
// revoca TODAS las sesiones → logout espurio. Con la cola: un solo /auth/refresh por
// ventana de expiración; el resto reintenta con el token nuevo.
//
// El single-flight en memoria sólo cubre UNA pestaña (la variable vive por módulo/tab).
// Para el caso multi-pestaña se suman dos defensas: (1) performRefresh relee el refresh
// MÁS fresco de localStorage, no el de memoria (otra pestaña pudo haberlo rotado ya); y
// (2) runExclusiveRefresh serializa el refresh ENTRE pestañas con la Web Locks API.
let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
    // Preferir el refresh persistido: si otra pestaña ya rotó el token, nuestra memoria
    // quedó vieja pero localStorage tiene el nuevo. Mandar el viejo → detección de reuso.
    const refreshToken = getPersistedRefreshToken() ?? useAuthStore.getState().refreshToken;
    if (!refreshToken) throw new Error('No refresh token');
    // axios "pelado" (no axiosInstance) → no re-entra en este interceptor.
    const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/auth/refresh`, {
        refreshToken,
    });
    const { access, refresh } = response.data as { access: string; refresh: string };
    // Guardar AMBOS: el refresh viejo quedó revocado en el backend; si no
    // persistimos el nuevo, el próximo refresh mandaría el revocado y dispararía
    // la detección de reuso (logout de todas las sesiones).
    useAuthStore.getState().setTokens(access, refresh);
    return access;
}

// Serializa el refresh ENTRE pestañas: sólo una pestaña ejecuta /auth/refresh a la vez.
// Las demás esperan el lock y, al entrar, performRefresh relee el token ya rotado de
// localStorage → nunca reusan uno revocado. Si el navegador no soporta Web Locks, degrada
// al single-flight por pestaña (sigue cubriendo el caso secuencial vía la lectura persistida).
function runExclusiveRefresh(): Promise<string> {
    if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.request) {
        return navigator.locks.request('autenza-auth-refresh', () => performRefresh());
    }
    return performRefresh();
}

function refreshAccessToken(): Promise<string> {
    if (!refreshPromise) {
        refreshPromise = runExclusiveRefresh().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
}

axiosInstance.interceptors.response.use(
    (response) => (response.config?.rawResponse ? response : response.data),
    async (error) => {
        const originalRequest = error.config;
        const url: string = originalRequest?.url || '';
        const isRefreshCall = url.includes('/auth/refresh');

        if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isRefreshCall) {
            originalRequest._retry = true;
            const { refreshToken } = useAuthStore.getState();

            if (refreshToken) {
                try {
                    const access = await refreshAccessToken();
                    originalRequest.headers = originalRequest.headers || {};
                    originalRequest.headers.Authorization = `Bearer ${access}`;
                    return axiosInstance(originalRequest);
                } catch (refreshError) {
                    useAuthStore.getState().logout();
                    window.location.href = '/login';
                    // Rechazar con la misma forma desempaquetada que el resto del
                    // interceptor (línea de abajo), no el AxiosError crudo.
                    const err = refreshError as { response?: { data?: unknown }; message?: string };
                    return Promise.reject(err?.response?.data ?? err?.message ?? refreshError);
                }
            }
        }

        return Promise.reject(error.response?.data || error.message);
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
