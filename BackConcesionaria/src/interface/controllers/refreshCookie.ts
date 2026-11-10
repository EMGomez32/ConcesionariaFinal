import { Request, Response, CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

/**
 * REFRESH TOKEN EN COOKIE httpOnly (web).
 *
 * El front guardaba el refresh en localStorage: cualquier XSS lo leía y se llevaba
 * una sesión de 7 días. En la cookie `autenza_rt` el JS de la página no lo ve; el
 * navegador lo manda solo a /api/auth (login, refresh, logout) y nunca cross-site
 * (SameSite=Strict, así que tampoco sirve para CSRF).
 *
 * La app móvil sigue igual: recibe los tokens en el cuerpo y los manda en
 * `body.refreshToken`, que tiene prioridad sobre la cookie.
 *
 * La WEB, en cambio, ya no recibe el refresh en el cuerpo (APP-11): si lo recibía, quedaba
 * en la memoria de la página y un XSS lo leía igual que antes del localStorage. Ver
 * `esClienteWeb` y `refreshParaElCuerpo`.
 *
 * Sin cookie-parser a propósito: hace falta leer UNA cookie, y para eso alcanza con
 * partir la cabecera `Cookie` (ver `leerCookie`). `res.cookie`/`res.clearCookie`
 * ya vienen con Express.
 */
export const COOKIE_REFRESH = 'autenza_rt';

/** Una semana: el default de JWT_REFRESH_EXPIRES_IN, por si el token no trae `exp`. */
const VIDA_POR_DEFECTO_MS = 7 * 24 * 60 * 60 * 1000;

const opcionesBase = (): CookieOptions => ({
    httpOnly: true,
    sameSite: 'strict',
    path: '/api/auth',
    // En desarrollo/test se sirve por http: con Secure el navegador la descartaría.
    secure: env.NODE_ENV === 'production',
});

/**
 * Vida del refresh: la de SU `exp`, que firma JwtTokenService con
 * JWT_REFRESH_EXPIRES_IN. Leerla del token evita reinterpretar el formato de esa
 * variable ("7d", "12h", "2 days"…) y garantiza que la cookie no sobreviva al token.
 */
function vidaMs(refresh: string): number {
    const decoded = jwt.decode(refresh);
    const exp = decoded && typeof decoded === 'object' ? decoded.exp : undefined;
    if (typeof exp !== 'number') return VIDA_POR_DEFECTO_MS;
    return Math.max(0, exp * 1000 - Date.now());
}

/** Pone (o rota) la cookie con el refresh recién emitido. */
export function ponerCookieRefresh(res: Response, refresh: string): void {
    res.cookie(COOKIE_REFRESH, refresh, { ...opcionesBase(), maxAge: vidaMs(refresh) });
}

/** Borra la cookie (mismos atributos de path/sameSite/secure, si no el navegador no la pisa). */
export function limpiarCookieRefresh(res: Response): void {
    res.clearCookie(COOKIE_REFRESH, opcionesBase());
}

/** Valor de una cookie de la cabecera `Cookie`, o undefined. */
export function leerCookie(req: Request, nombre: string): string | undefined {
    const cabecera = req.headers.cookie;
    if (!cabecera) return undefined;
    for (const parte of cabecera.split(';')) {
        const igual = parte.indexOf('=');
        if (igual < 0 || parte.slice(0, igual).trim() !== nombre) continue;
        const valor = parte.slice(igual + 1).trim().replace(/^"(.*)"$/, '$1');
        try {
            return decodeURIComponent(valor);
        } catch {
            return valor;
        }
    }
    return undefined;
}

/** El refresh vino en `body.refreshToken` (app móvil), no en la cookie. */
export function refreshVinoEnElCuerpo(req: Request): boolean {
    const delBody = req.body?.refreshToken;
    return typeof delBody === 'string' && delBody.length > 0;
}

/** El refresh de la request: el del body si viene (app móvil), si no el de la cookie (web). */
export function refreshDeLaRequest(req: Request): string | undefined {
    if (refreshVinoEnElCuerpo(req)) return req.body.refreshToken as string;
    return leerCookie(req, COOKIE_REFRESH) || undefined;
}

/**
 * Cabecera con la que el front web se identifica (la manda SÓLO su cliente axios). No es
 * una credencial ni un control de acceso: un cliente que no la mande no gana nada que no
 * tuviera (el contrato de la app móvil), y uno que la mande sólo se pierde el refresh en
 * el cuerpo. Sirve para que la web no reciba nunca el refresh en un JSON.
 */
export const CABECERA_CLIENTE = 'x-autenza-cliente';

/** La request viene del front web (`X-Autenza-Cliente: web`). */
export function esClienteWeb(req: Request): boolean {
    const v = req.headers[CABECERA_CLIENTE];
    return typeof v === 'string' && v.trim().toLowerCase() === 'web';
}

/**
 * ¿Va el refresh en el cuerpo de la respuesta? Sólo si el cliente lo maneja él mismo:
 *  - con `X-Autenza-Cliente: web`, nunca (le alcanza la cookie);
 *  - en /auth/refresh, además, sólo si el token vino en el CUERPO. Si vino en la cookie,
 *    quien llama es un navegador, y devolverlo en el JSON lo dejaría al alcance de un
 *    script inyectado en la página que llamara a /auth/refresh sin la cabecera: la cookie
 *    httpOnly no serviría de nada. La app móvil siempre manda `body.refreshToken`, así
 *    que su contrato no cambia.
 */
export function refreshParaElCuerpo(req: Request, opciones: { exigirQueVengaEnElCuerpo?: boolean } = {}): boolean {
    if (esClienteWeb(req)) return false;
    if (opciones.exigirQueVengaEnElCuerpo && !refreshVinoEnElCuerpo(req)) return false;
    return true;
}

/** Los tokens de una sesión sin el refresh (lo que ve la web: el refresh queda en la cookie). */
export function sinRefresh<T extends { refresh: string }>(tokens: T): Omit<T, 'refresh'> {
    const { refresh, ...resto } = tokens;
    void refresh;
    return resto;
}
