import { AxiosError } from 'axios';

/**
 * Extrae un mensaje de error legible de una respuesta de API o error de JS.
 */
export function getErrorMessage(err: unknown, fallback = 'Error inesperado'): string {
    if (typeof err === 'string') return err;

    if (err instanceof AxiosError) {
        const apiMessage = (err.response?.data as { message?: string })?.message;
        if (apiMessage) return apiMessage;
        return err.message;
    }

    if (err instanceof Error) {
        return err.message;
    }

    if (err && typeof err === 'object') {
        if ('message' in err && typeof (err as { message: unknown }).message === 'string') {
            return (err as { message: string }).message;
        }
    }

    return fallback;
}
