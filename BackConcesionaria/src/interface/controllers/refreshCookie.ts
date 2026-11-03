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
 * La app móvil sigue igual: recibe los tokens en el cuerpo (que NO cambia) y los
 * manda en `body.refreshToken`, que tiene prioridad sobre la cookie.
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

/** El refresh de la request: el del body si viene (app móvil), si no el de la cookie (web). */
export function refreshDeLaRequest(req: Request): string | undefined {
    const delBody = req.body?.refreshToken;
    if (typeof delBody === 'string' && delBody) return delBody;
    return leerCookie(req, COOKIE_REFRESH) || undefined;
}
