import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../config';
import { useAuthStore } from '../store/authStore';
import { mensajeDeError, refreshInvalidaSesion } from '../lib/errores';

/**
 * Cliente HTTP de la app. Inyecta el access token en cada request y, ante un 401,
 * intenta UNA vez refrescar el token (single-flight) y reintentar.
 *
 * Si el refresh falla porque el servidor dice que el token ya no sirve (401/400),
 * cierra la sesión y el login avisa "Tu sesión venció". Si falla por RED (o el
 * servidor está caído), la sesión NO se cierra: el error llega a la pantalla
 * ("Sin conexión…") y el próximo intento vuelve a refrescar.
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
    const { refreshToken, user } = useAuthStore.getState();
    if (!refreshToken) {
        // Sin refresh token no hay forma de seguir: si había sesión, venció.
        if (user) await useAuthStore.getState().logout('vencida');
        return null;
    }
    try {
        // axios "pelado" para no re-entrar en este interceptor.
        const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken }, { timeout: 20000 });
        const { access, refresh } = res.data as { access: string; refresh: string };
        await useAuthStore.getState().setTokens(access, refresh);
        return access;
    } catch (e) {
        if (refreshInvalidaSesion((e as AxiosError).response?.status)) {
            await useAuthStore.getState().logout('vencida');
            return null;
        }
        // Red / servidor: se propaga para que la pantalla muestre el motivo real.
        throw e;
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
            let newToken: string | null;
            try {
                newToken = await refreshing;
            } catch (errRefresh) {
                return Promise.reject(errRefresh);
            }
            if (newToken) {
                original.headers.Authorization = `Bearer ${newToken}`;
                return api(original);
            }
        }
        return Promise.reject(error);
    },
);

/** Mensaje de error legible (en español, nunca "Network Error"). */
export function errorMessage(e: unknown, fallback = 'Algo salió mal. Probá de nuevo.'): string {
    return mensajeDeError(e, fallback);
}
