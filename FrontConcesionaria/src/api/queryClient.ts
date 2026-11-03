import { QueryClient, QueryCache, MutationCache, type Mutation } from '@tanstack/react-query';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { getErrorMessage } from '../utils/getErrorMessage';

/**
 * `meta` que entienden los avisos globales de error (useQuery / useMutation):
 *   meta: { silenciarError: true }  → este error lo muestra la pantalla (estado de
 *   error de la tabla, mensaje en el formulario), no hace falta el toast global.
 */
interface MetaDeAviso {
    silenciarError?: boolean;
}

const silenciado = (meta: unknown) => (meta as MetaDeAviso | undefined)?.silenciarError === true;

/** El cliente HTTP ya llevó al login: no tiene sentido un toast por cada request que cayó. */
const esSesionVencida = (error: unknown) => (error as { error?: unknown } | null)?.error === 'SESION_VENCIDA';

/**
 * ¿El aviso global debe toastear el error de esta mutación? NO cuando la propia
 * mutación define `onError` (ella ya avisa a su manera: antes había 33 caminos con
 * DOBLE toast, el global y el de la pantalla), ni cuando pide silencio por `meta`.
 *
 * Ojo: los callbacks que se pasan a `mutate(vars, { onError })` o el try/catch de
 * un `mutateAsync` no son visibles desde acá; esos casos marcan
 * `meta: { silenciarError: true }` en el useMutation.
 */
export function avisaErrorDeMutacion(mutation: Pick<Mutation<unknown, unknown, unknown, unknown>, 'options' | 'meta'>): boolean {
    if (typeof mutation.options.onError === 'function') return false;
    if (silenciado(mutation.meta ?? mutation.options.meta)) return false;
    return true;
}

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
        onError: (error: unknown, query) => {
            // Sin sesión no se toastea: tras un logout, algún observer todavía
            // montado puede disparar un último refetch ya sin token; ese 401 es
            // esperable y no accionable para el usuario. Las pantallas públicas
            // (login/recupero) no montan queries, así que no se silencia nada real.
            if (!useAuthStore.getState().isAuthenticated) return;
            if (esSesionVencida(error) || silenciado(query.meta)) return;
            useUIStore.getState().addToast(getErrorMessage(error, 'No se pudieron cargar los datos'), 'error');
        },
    }),
    mutationCache: new MutationCache({
        onError: (error: unknown, _variables, _context, mutation) => {
            if (esSesionVencida(error) || !avisaErrorDeMutacion(mutation)) return;
            useUIStore.getState().addToast(getErrorMessage(error, 'No se pudo completar la operación'), 'error');
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
