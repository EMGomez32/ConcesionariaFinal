import client from './client';
import { useAuthStore, getPersistedRefreshToken } from '../store/authStore';

/**
 * Cierra la sesión del usuario. Limpia el estado local PRIMERO y recién después
 * revoca el refresh token en el backend (best-effort):
 *
 *  - Limpiar primero hace que el usuario quede deslogueado al instante aunque el
 *    backend no responda o la request se cuelgue (no dependemos del round-trip para
 *    cerrar la sesión local).
 *  - Además, al vaciar el store antes del POST, ninguna request en vuelo puede releer
 *    este refresh token y mandarlo a /auth/refresh justo cuando el logout lo está
 *    invalidando (evita la carrera con la detección de reuso).
 *
 * Sólo cierra ESTA sesión, no las de otros dispositivos.
 */
export async function performLogout(): Promise<void> {
    // Capturar el refresh MÁS fresco ANTES de limpiar: se prefiere el persistido en
    // localStorage porque, en multi-pestaña, otra pestaña pudo haberlo rotado y el de
    // memoria de ésta quedó viejo. Así se revoca en el backend el token que de verdad
    // está activo (no uno ya rotado).
    const refreshToken = getPersistedRefreshToken() ?? useAuthStore.getState().refreshToken;
    useAuthStore.getState().logout();

    if (refreshToken) {
        try {
            await client.post('/auth/logout', { refreshToken });
        } catch {
            // best-effort: el logout local ya ocurrió.
        }
    }
}
