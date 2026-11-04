import crypto from 'crypto';

/**
 * TOTP (RFC 6238) sobre HOTP (RFC 4226): HMAC-SHA1, 30 s, 6 dígitos. Es lo que entienden Google
 * Authenticator, Microsoft Authenticator, Authy, 1Password, etc. Sin dependencias externas.
 */

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PERIODO_SEG = 30;
export const DIGITOS = 6;

export function base32Encode(buf: Buffer): string {
    let bits = 0;
    let valor = 0;
    let salida = '';
    for (const byte of buf) {
        valor = (valor << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            salida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) salida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
    return salida;
}

export function base32Decode(texto: string): Buffer {
    const limpio = texto.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
    let bits = 0;
    let valor = 0;
    const bytes: number[] = [];
    for (const c of limpio) {
        const idx = ALFABETO_BASE32.indexOf(c);
        if (idx < 0) throw new Error('base32 inválido');
        valor = (valor << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((valor >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

/** Secreto nuevo: 20 bytes aleatorios (160 bits, lo que recomienda la RFC 4226) en base32. */
export function generarSecretoTotp(): string {
    return base32Encode(crypto.randomBytes(20));
}

/** HOTP(K, contador) → código de `DIGITOS` dígitos. */
export function hotp(secretoBase32: string, contador: number): string {
    const clave = base32Decode(secretoBase32);
    const msg = Buffer.alloc(8);
    // Contador de 64 bits big-endian (los pasos de TOTP entran holgados en 53 bits).
    msg.writeUInt32BE(Math.floor(contador / 0x100000000), 0);
    msg.writeUInt32BE(contador >>> 0, 4);
    const hmac = crypto.createHmac('sha1', clave).update(msg).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const bin =
        ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
    return String(bin % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

/** Paso (ventana de 30 s) al que pertenece un instante. */
export const pasoDe = (ahoraMs: number): number => Math.floor(ahoraMs / 1000 / PERIODO_SEG);

export const codigoTotp = (secretoBase32: string, ahoraMs = Date.now()): string => hotp(secretoBase32, pasoDe(ahoraMs));

const igual = (a: string, b: string): boolean => {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

/**
 * Verifica un código y devuelve el PASO en que coincidió, o null. Tolera ±`ventana` pasos
 * (reloj del teléfono desfasado). `ultimoPaso` evita el REPLAY: un código ya usado (o uno más
 * viejo) no vale otra vez, aunque siga dentro de la ventana de validez.
 */
export function verificarTotp(
    secretoBase32: string,
    codigo: string,
    opciones: { ahoraMs?: number; ventana?: number; ultimoPaso?: number | null } = {},
): number | null {
    const limpio = String(codigo ?? '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(limpio)) return null;
    const { ahoraMs = Date.now(), ventana = 1, ultimoPaso = null } = opciones;
    const actual = pasoDe(ahoraMs);
    let encontrado: number | null = null;
    // Se recorren TODOS los pasos (sin cortar al primer acierto) para no filtrar por tiempo cuál coincidió.
    for (let p = actual - ventana; p <= actual + ventana; p++) {
        if (p < 0) continue;
        if (igual(hotp(secretoBase32, p), limpio) && (ultimoPaso == null || p > ultimoPaso)) {
            if (encontrado === null || p > encontrado) encontrado = p;
        }
    }
    return encontrado;
}

/** URI que leen las apps (se muestra como QR): otpauth://totp/Emisor:cuenta?secret=…&issuer=… */
export function otpauthUrl(params: { secreto: string; cuenta: string; emisor: string }): string {
    const { secreto, cuenta, emisor } = params;
    const etiqueta = `${encodeURIComponent(emisor)}:${encodeURIComponent(cuenta)}`;
    const q = new URLSearchParams({ secret: secreto, issuer: emisor, algorithm: 'SHA1', digits: String(DIGITOS), period: String(PERIODO_SEG) });
    return `otpauth://totp/${etiqueta}?${q.toString()}`;
}

// ── Códigos de recuperación (un solo uso) ───────────────────────────────────

const ALFABETO_CODIGOS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I: se leen y tipean sin confundirse

/** `xxxxx-xxxxx` (10 caracteres de un alfabeto de 32 = 50 bits). */
export function generarCodigoRecuperacion(): string {
    const bytes = crypto.randomBytes(10);
    let s = '';
    for (let i = 0; i < 10; i++) s += ALFABETO_CODIGOS[bytes[i] % ALFABETO_CODIGOS.length];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
}

export const CANTIDAD_CODIGOS_RECUPERACION = 10;

/** Normaliza lo que tipea el usuario (mayúsculas, sin espacios, con o sin guion). */
export function normalizarCodigoRecuperacion(entrada: string): string | null {
    const limpio = String(entrada ?? '').toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-Z2-9]{10}$/.test(limpio)) return null;
    return `${limpio.slice(0, 5)}-${limpio.slice(5)}`;
}

/** Hash de un código de recuperación (se guarda el hash, nunca el código). */
export const hashCodigoRecuperacion = (codigoNormalizado: string): string =>
    crypto.createHash('sha256').update(`recovery-v1:${codigoNormalizado}`).digest('hex');
