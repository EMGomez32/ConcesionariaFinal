/**
 * Utilidades de la frontera de sesión que no son estado de React:
 *  - la ruta a la que volver después de entrar (si la sesión venció en medio de
 *    un trabajo, al loguearse se vuelve ahí y no al inicio);
 *  - el aviso que muestra el login ("Tu sesión venció. Volvé a entrar.");
 *  - el canal entre pestañas por el que una pestaña avisa que renovó el access
 *    token, para que las demás lo usen en vez de rotar el refresh otra vez.
 *
 * Ruta y aviso van en sessionStorage (por pestaña, sobreviven a la recarga que
 * hace el cliente HTTP al vencer la sesión). Nada de esto es un secreto: no se
 * guardan tokens acá.
 */

const CLAVE_REGRESO = 'autenza:volver-a';
const CLAVE_AVISO = 'autenza:aviso-login';

/**
 * 'sesion-maxima': la sesión llegó a su duración máxima desde el login (el backend
 * responde SESION_MAXIMA_VENCIDA). No es un error ni inactividad: es el tope, y se
 * dice así para que nadie piense que algo anda mal.
 */
export type AvisoLogin = 'sesion-vencida' | 'sesion-maxima';

export const TEXTO_AVISO: Record<AvisoLogin, string> = {
    'sesion-vencida': 'Tu sesión venció. Volvé a entrar.',
    'sesion-maxima': 'Por seguridad, cada sesión dura un tiempo máximo. Volvé a entrar.',
};

/**
 * Sólo rutas internas de la app: empieza con "/" (no "//", que sería otro host)
 * y no es una pantalla de auth (volver a /login después de entrar no tiene sentido).
 */
export function rutaSegura(ruta: unknown): string | null {
    if (typeof ruta !== 'string') return null;
    if (!ruta.startsWith('/') || ruta.startsWith('//') || ruta.includes('\\')) return null;
    if (/^\/(login|forgot-password|reset-password)(\/|\?|#|$)/.test(ruta)) return null;
    return ruta;
}

const leer = (clave: string): string | null => {
    try { return window.sessionStorage.getItem(clave); } catch { return null; }
};
const escribir = (clave: string, valor: string | null) => {
    try {
        if (valor == null) window.sessionStorage.removeItem(clave);
        else window.sessionStorage.setItem(clave, valor);
    } catch { /* storage bloqueado: se pierde la comodidad, no la sesión */ }
};

export function guardarRegreso(ruta: string) {
    const segura = rutaSegura(ruta);
    if (segura) escribir(CLAVE_REGRESO, segura);
}

export const leerRegreso = (): string | null => rutaSegura(leer(CLAVE_REGRESO));
export const limpiarRegreso = () => escribir(CLAVE_REGRESO, null);

export const marcarAvisoLogin = (aviso: AvisoLogin) => escribir(CLAVE_AVISO, aviso);
export const leerAvisoLogin = (): AvisoLogin | null => {
    const v = leer(CLAVE_AVISO);
    return v === 'sesion-vencida' || v === 'sesion-maxima' ? v : null;
};
export const limpiarAvisoLogin = () => escribir(CLAVE_AVISO, null);

/* ─── Canal entre pestañas ─── */

export type MensajeSesion = { tipo: 'renovada'; access: string; userId?: number };

const NOMBRE_CANAL = 'autenza-sesion';
let canal: BroadcastChannel | null = null;

const abrirCanal = (): BroadcastChannel | null => {
    if (canal) return canal;
    if (typeof BroadcastChannel === 'undefined') return null;
    try {
        canal = new BroadcastChannel(NOMBRE_CANAL);
        // En Node (tests) un canal abierto mantiene vivo el proceso; en el navegador no existe.
        (canal as unknown as { unref?: () => void }).unref?.();
    } catch { canal = null; }
    return canal;
};

export function avisarOtrasPestanas(msg: MensajeSesion) {
    try { abrirCanal()?.postMessage(msg); } catch { /* sin canal: cada pestaña rota por su cuenta */ }
}

export function escucharOtrasPestanas(alRecibir: (msg: MensajeSesion) => void): () => void {
    const c = abrirCanal();
    if (!c) return () => {};
    const handler = (e: MessageEvent) => {
        const d = e.data as Partial<MensajeSesion> | null;
        if (d && d.tipo === 'renovada' && typeof d.access === 'string') alRecibir(d as MensajeSesion);
    };
    c.addEventListener('message', handler);
    return () => c.removeEventListener('message', handler);
}
