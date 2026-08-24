import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { JWT_ALGORITHM, JWT_ALGORITHMS } from './jwtOptions';

/**
 * `state` del OAuth de Mercado Libre.
 *
 * Es la pieza de seguridad del flujo, y tiene que resistir dos cosas distintas:
 *
 *  1. FALSIFICACIÓN del tenant. El `state` es el ÚNICO dato que dice a qué
 *     concesionaria pertenece el callback, y vuelve por la barra del navegador:
 *     va firmado para que nadie pueda fabricar uno con otro `cid`.
 *
 *  2. FORCED ACCOUNT LINKING / replay. Una firma válida NO alcanza: el atacante
 *     puede pedir un `state` legítimo de SU tenant y mandarle el link a la
 *     víctima; si la víctima autoriza, los tokens de SU cuenta de Mercado Libre
 *     quedan colgados del tenant del atacante, que desde ahí publica, cierra
 *     avisos (irreversible) y contesta en nombre del vendedor. Por eso el
 *     `state` se ata al NAVEGADOR que arrancó el flujo: el nonce se guarda en
 *     una cookie httpOnly y el callback exige que coincida. Un `state` que
 *     aparezca en un log, en el historial o en el Referer no le sirve a nadie
 *     que no tenga esa cookie, y como la cookie se borra al usarse, tampoco se
 *     puede repetir.
 *
 * Se firma con un secreto DERIVADO de JWT_SECRET, no con JWT_SECRET. Un `state`
 * se le entrega a un tercero (Mercado Libre) y viaja por la URL: firmado con la
 * misma clave que los access token, `contextMiddleware` lo aceptaba como sesión
 * (un principal sin rol y sin tenant, pero autenticado). Con clave propia, un
 * token de un propósito no puede usarse nunca en el otro.
 */

/** TTL del state. Corto: alcanza de sobra para autorizar y acota el replay. */
const TTL_SEGUNDOS = 10 * 60;

/** Discriminador de propósito, exigido al verificar (defensa en profundidad). */
const TIPO = 'ml_oauth_state';

/** Cookie que ata el state al navegador que lo pidió. */
const COOKIE_NONCE = 'ml_oauth_nonce';

/** Sólo se manda al callback público: no hace falta en ninguna otra ruta. */
const COOKIE_PATH = '/api/webhooks/mercadolibre';

/**
 * Clave propia del state, derivada de JWT_SECRET con una etiqueta fija. Se
 * deriva en vez de pedir otra env var para no sumar un secreto que haya que
 * rotar aparte: el resultado es independiente del secreto de sesión (no se puede
 * volver a JWT_SECRET desde acá) y cambia con él.
 */
const secretoDelState = (): string =>
    crypto.createHmac('sha256', env.JWT_SECRET).update(TIPO).digest('hex');

export interface StateOauthMl {
    /** Concesionaria a la que se le va a colgar la cuenta. */
    cid: number;
    /** Usuario que arrancó el flujo (queda en el audit del vínculo). */
    sub: number;
}

/**
 * Emite el `state` y deja en la respuesta la cookie con su nonce.
 *
 * SameSite=Lax es lo que hace falta y lo más estricto posible: el callback llega
 * como navegación top-level GET desde Mercado Libre (Lax la permite), pero la
 * cookie no viaja en ningún request cross-site de fondo.
 */
export function emitirStateOauthMl(res: Response, datos: StateOauthMl): string {
    const nonce = crypto.randomUUID();
    res.cookie(COOKIE_NONCE, nonce, {
        httpOnly: true,
        sameSite: 'lax',
        // En desarrollo el panel corre sobre http://localhost: con `secure` la
        // cookie no se guardaría y la vinculación sería imposible de probar.
        secure: env.NODE_ENV === 'production',
        path: COOKIE_PATH,
        maxAge: TTL_SEGUNDOS * 1000,
    });
    return jwt.sign(
        { typ: TIPO, cid: datos.cid, sub: String(datos.sub), nonce },
        secretoDelState(),
        { expiresIn: TTL_SEGUNDOS, algorithm: JWT_ALGORITHM },
    );
}

/** Nonce de la cookie. Se parsea a mano: el proyecto no usa cookie-parser. */
function nonceDeLaCookie(req: Request): string | null {
    const crudo = req.headers.cookie;
    if (!crudo) return null;
    for (const parte of crudo.split(';')) {
        const corte = parte.indexOf('=');
        if (corte < 0) continue;
        if (parte.slice(0, corte).trim() !== COOKIE_NONCE) continue;
        return decodeURIComponent(parte.slice(corte + 1).trim()) || null;
    }
    return null;
}

/** Un state consumido no se puede repetir: la cookie se borra siempre. */
export function limpiarCookieDeState(res: Response): void {
    res.clearCookie(COOKIE_NONCE, { path: COOKIE_PATH });
}

/**
 * Verifica el `state` del callback contra la cookie del navegador.
 *
 * Devuelve null si no valida (firma, algoritmo, tipo, TTL o nonce): el motivo NO
 * se distingue hacia afuera porque el state es material de autenticación, y
 * cualquiera de esos casos se resuelve igual (volver a pedir el link).
 */
export function verificarStateOauthMl(req: Request, state: string): StateOauthMl | null {
    const nonceEsperado = nonceDeLaCookie(req);
    if (!nonceEsperado) return null;

    try {
        const payload = jwt.verify(state, secretoDelState(), { algorithms: JWT_ALGORITHMS }) as {
            typ?: string;
            cid?: number;
            sub?: string;
            nonce?: string;
        };
        if (payload?.typ !== TIPO) return null;
        const cid = Number(payload?.cid);
        const sub = Number(payload?.sub);
        if (!Number.isInteger(cid) || cid <= 0) return null;
        if (!payload.nonce) return null;
        // timingSafeEqual exige buffers del mismo largo: se compara el hash para
        // no filtrar la longitud del nonce por el error de comparación.
        const a = crypto.createHash('sha256').update(payload.nonce).digest();
        const b = crypto.createHash('sha256').update(nonceEsperado).digest();
        if (!crypto.timingSafeEqual(a, b)) return null;
        return { cid, sub: Number.isInteger(sub) && sub > 0 ? sub : 0 };
    } catch {
        return null;
    }
}
