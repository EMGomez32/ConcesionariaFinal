import { QueryClient } from '@tanstack/react-query';
import { esErrorDeCliente } from '../lib/errores';

/**
 * Caché de datos de la app. Vive en un módulo propio para que el logout la vacíe
 * (`queryClient.clear()`): si no, el próximo usuario que entra en el mismo
 * teléfono ve por un instante las listas del anterior.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Un reintento ante red o servidor; un 4xx (403 de rol, 404) no mejora reintentando.
            retry: (fallos, error) => fallos < 1 && !esErrorDeCliente(error),
            staleTime: 30_000,
        },
    },
});
