import { Request } from 'express';

/**
 * IP real del cliente. Fuente única para auditoría y rate limiting.
 *
 * Detrás del Cloudflare Tunnel (producción) la IP del visitante llega en
 * `CF-Connecting-IP`: Cloudflare la setea en el borde y la reescribe en cada
 * request, así que es confiable mientras la app sólo se exponga por el túnel
 * (que es el caso). Si no hay ese header, cae a `req.ip`, que ya resuelve
 * `X-Forwarded-For` respetando `trust proxy` (ver app.ts) — sirve para nginx u
 * otro proxy y para local (donde da ::1, el loopback, que ES la IP real).
 *
 * No se lee `X-Forwarded-For` crudo del header a propósito: es falsificable por
 * el cliente (cualquiera podría inyectar una IP), y `req.ip` ya lo procesa de
 * forma segura según la cantidad de proxies confiables configurada.
 */
export function getClientIp(req: Request): string | undefined {
    const cf = req.headers['cf-connecting-ip'];
    const ip = (typeof cf === 'string' && cf.trim()) ? cf.trim() : req.ip;
    return normalizeIp(ip);
}

/** Quita el prefijo de IPv4 mapeada a IPv6: `::ffff:200.1.2.3` -> `200.1.2.3`. */
export function normalizeIp(ip?: string): string | undefined {
    if (!ip) return undefined;
    return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}
