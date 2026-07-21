import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { useAuthStore } from '../store/authStore';

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

axiosInstance.interceptors.response.use(
    (response) => (response.config?.rawResponse ? response : response.data),
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            const { refreshToken, setAccessToken, logout } = useAuthStore.getState();

            if (refreshToken) {
                try {
                    const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/auth/refresh`, {
                        refreshToken,
                    });

                    const { access } = response.data;
                    setAccessToken(access);

                    originalRequest.headers.Authorization = `Bearer ${access}`;
                    return axiosInstance(originalRequest);
                } catch (refreshError) {
                    logout();
                    window.location.href = '/login';
                    return Promise.reject(refreshError);
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
