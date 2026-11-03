import client from './client';
import { queryClient } from './queryClient';
import { useAuthStore } from '../store/authStore';
import { limpiarRegreso } from '../store/sesion';

/**
 * Marca de "salida voluntaria": ProtectedRoute la lee para NO recordar la ruta en
 * la que estaba el usuario (si cierra la sesión y entra otra persona, que arranque
 * en el inicio y no en la pantalla del anterior). Vive en memoria (el logout no
 * recarga la página) y se apaga al volver a entrar.
 */
let salidaVoluntaria = false;
export const haySalidaVoluntaria = (): boolean => salidaVoluntaria;
export const limpiarSalidaVoluntaria = () => { salidaVoluntaria = false; };

/**
 * Cierra la sesión del usuario. Limpia el estado local PRIMERO y recién después
 * revoca el refresh en el backend (best-effort):
 *
 *  - Limpiar primero hace que el usuario quede deslogueado al instante aunque el
 *    backend no responda o la request se cuelgue (no dependemos del round-trip para
 *    cerrar la sesión local).
 *  - Además, al vaciar el store antes del POST, ninguna request en vuelo dispara un
 *    /auth/refresh (el interceptor sólo renueva si hay usuario) justo cuando el
 *    logout está invalidando la cookie (evita la carrera con la detección de reuso).
 *  - El refresh viaja en la cookie httpOnly: /auth/logout la revoca y la borra.
 *    El cuerpo va vacío (el campo `refreshToken` del cuerpo es para la app móvil).
 *  - Las otras pestañas se enteran por el evento `storage` (el usuario persistido
 *    pasa a null) y cierran también.
 *
 * Sólo cierra ESTA sesión, no las de otros dispositivos.
 */
export async function performLogout(): Promise<void> {
    const teniaSesion = !!useAuthStore.getState().user;
    salidaVoluntaria = true;
    limpiarRegreso();
    useAuthStore.getState().logout();
    // El caché de React Query guarda datos del usuario/tenant saliente y el
    // QueryClient singleton sobrevive a la navegación SPA logout→login: sin esto,
    // el usuario siguiente vería datos cacheados del anterior hasta vencer el
    // staleTime (las queryKeys no discriminan por usuario). Se limpia DESPUÉS de
    // vaciar el store: si algún observer todavía montado dispara un último
    // refetch, sale sin token y el 401 resultante no toastea (queryClient.ts lo
    // silencia sin sesión). Sólo afecta ESTA pestaña, igual que el logout local.
    queryClient.clear();

    if (teniaSesion) {
        try {
            await client.post('/auth/logout', {});
        } catch {
            // best-effort: el logout local ya ocurrió.
        }
    }
}
