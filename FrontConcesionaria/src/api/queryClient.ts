import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';

/**
 * QueryClient singleton de la app. Vive en su propio módulo (y no en main.tsx)
 * para que los flujos de sesión puedan limpiarlo: el caché guarda datos del
 * usuario/tenant saliente y sobrevive a la navegación SPA logout→login, así que
 * sin un clear() explícito el usuario siguiente vería datos cacheados del
 * anterior hasta vencer el staleTime (las keys no discriminan por usuario).
 * Se limpia en performLogout, en el logout forzado del interceptor 401 y antes
 * de setAuth en el login (cubre el cambio de cuenta sin pasar por logout).
 */
export const queryClient = new QueryClient({
    queryCache: new QueryCache({
        onError: (error: unknown) => {
            // Sin sesión no se toastea: tras un logout, algún observer todavía
            // montado puede disparar un último refetch ya sin token; ese 401 es
            // esperable y no accionable para el usuario. Las pantallas públicas
            // (login/recupero) no montan queries, así que no se silencia nada real.
            if (!useAuthStore.getState().isAuthenticated) return;
            const message = (error as { message?: string })?.message || 'Error al cargar los datos';
            useUIStore.getState().addToast(message, 'error');
        },
    }),
    mutationCache: new MutationCache({
        onError: (error: unknown) => {
            const message = (error as { message?: string })?.message || 'Error al realizar la operación';
            useUIStore.getState().addToast(message, 'error');
        },
    }),
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});
