/**
 * Después de un deploy, los chunks lazy viejos (VehiculosPage-abc123.js) ya no
 * existen en el servidor: una pestaña abierta desde antes falla al navegar a una
 * pantalla que todavía no había cargado. Se detecta ese error y se recarga UNA
 * vez para traer la versión nueva; si vuelve a fallar enseguida (no es el deploy,
 * es otra cosa) no se recarga en bucle y la barrera muestra el aviso.
 */

const CLAVE = 'autenza:recarga-por-version';
/** Ventana en la que no se vuelve a recargar sola (evita el bucle). */
const VENTANA_MS = 60_000;

const PATRONES = [
    /Failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /Importing a module script failed/i,
    /Unable to preload CSS/i,
    /Loading (CSS )?chunk [\w-]+ failed/i,
];

export function esErrorDeCarga(error: unknown): boolean {
    if (!error) return false;
    const e = error as { name?: unknown; message?: unknown };
    if (e.name === 'ChunkLoadError') return true;
    const mensaje = typeof e.message === 'string' ? e.message : String(error);
    return PATRONES.some((p) => p.test(mensaje));
}

/**
 * Recarga la página para tomar la versión nueva, salvo que ya lo haya hecho hace
 * menos de un minuto. Devuelve true si recargó.
 */
export function recargarPorVersionNueva(): boolean {
    try {
        const ultima = Number(window.sessionStorage.getItem(CLAVE) || 0);
        if (Date.now() - ultima < VENTANA_MS) return false;
        window.sessionStorage.setItem(CLAVE, String(Date.now()));
    } catch {
        // Sin sessionStorage no hay forma de evitar el bucle: no se recarga sola.
        return false;
    }
    window.location.reload();
    return true;
}
