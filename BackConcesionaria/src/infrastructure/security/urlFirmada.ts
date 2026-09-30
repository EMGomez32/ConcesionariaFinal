import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * URLs firmadas y con vencimiento para los archivos PRIVADOS (adjuntos de solicitudes
 * de financiación: DNI, recibos de sueldo).
 *
 * Antes /uploads era público: el nombre aleatorio de 128 bits hacía de "contraseña", pero
 * un link filtrado (logs, historial, un ex-empleado, un mail reenviado) daba acceso
 * PERMANENTE y sin sesión. Una URL firmada vence, y sólo la emite el backend a un usuario
 * ya autenticado y con acceso a esa solicitud.
 *
 * Se firma con HMAC-SHA256 sobre `ruta|exp` con una clave DERIVADA de JWT_SECRET para este
 * único propósito (una firma de acá no sirve como token de sesión ni al revés).
 */

const TTL_POR_DEFECTO_SEG = 30 * 60;

function clave(): Buffer {
    return crypto.createHmac('sha256', env.JWT_SECRET).update('uploads-privados-url-v1').digest();
}

function firma(ruta: string, exp: number): string {
    return crypto.createHmac('sha256', clave()).update(`${ruta}|${exp}`).digest('hex');
}

/** `/uploads/solicitudes/1/x.pdf` → `/uploads/solicitudes/1/x.pdf?exp=…&sig=…` */
export function firmarRuta(ruta: string, ttlSeg = TTL_POR_DEFECTO_SEG, ahoraMs = Date.now()): string {
    const exp = Math.floor(ahoraMs / 1000) + ttlSeg;
    return `${ruta}?exp=${exp}&sig=${firma(ruta, exp)}`;
}

/** ¿La firma es válida y no venció? Comparación en tiempo constante. */
export function verificarRutaFirmada(ruta: string, exp: unknown, sig: unknown, ahoraMs = Date.now()): boolean {
    if (typeof exp !== 'string' || typeof sig !== 'string') return false;
    if (!/^\d{1,12}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) return false;
    const expNum = Number(exp);
    if (expNum < Math.floor(ahoraMs / 1000)) return false;
    const esperada = Buffer.from(firma(ruta, expNum), 'hex');
    const recibida = Buffer.from(sig, 'hex');
    return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}
