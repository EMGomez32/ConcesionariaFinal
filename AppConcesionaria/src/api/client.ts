import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../config';
import { useAuthStore } from '../store/authStore';

/**
 * Cliente HTTP de la app. Inyecta el access token en cada request y, ante un 401,
 * intenta UNA vez refrescar el token (single-flight) y reintentar. Si el refresh
 * falla, cierra la sesión → la app vuelve al login.
 */
export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 20000,
});

api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

let refreshing: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) return null;
    try {
        // axios "pelado" para no re-entrar en este interceptor.
        const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        const { access, refresh } = res.data as { access: string; refresh: string };
        await useAuthStore.getState().setTokens(access, refresh);
        return access;
    } catch {
        await useAuthStore.getState().logout();
        return null;
    }
}

api.interceptors.response.use(
    (r) => r,
    async (error: AxiosError) => {
        const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
        const status = error.response?.status;

        if (status === 401 && original && !original._retry) {
            original._retry = true;
            if (!refreshing) refreshing = performRefresh().finally(() => { refreshing = null; });
            const newToken = await refreshing;
            if (newToken) {
                original.headers.Authorization = `Bearer ${newToken}`;
                return api(original);
            }
        }
        return Promise.reject(error);
    },
);

/** Mensaje de error legible desde una respuesta del backend. */
export function errorMessage(e: unknown, fallback = 'Algo salió mal'): string {
    const ax = e as AxiosError<{ message?: string }>;
    return ax?.response?.data?.message || (e as Error)?.message || fallback;
}
