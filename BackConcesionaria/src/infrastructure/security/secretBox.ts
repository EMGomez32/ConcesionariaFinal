import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * Cifrado en reposo de los secretos de integraciones (appSecret/pageAccessToken
 * de Meta, pass IMAP): AES-256-GCM con clave de INTEGRACIONES_SECRET_KEY
 * (64 hex = 32 bytes; generarla EN la Pi con `openssl rand -hex 32`, mismo
 * procedimiento que los JWT: nunca sale del servidor).
 *
 * Formato en reposo: `enc:v1:<iv_b64>:<tag_b64>:<ct_b64>`. Todo valor que NO
 * empiece con ese prefijo se trata como texto plano legado (retrocompat): se
 * usa tal cual y se cifra recién cuando la integración se vuelve a guardar
 * (migración lazy en el update del controller).
 *
 * Sin la env var seteada, el sistema sigue en claro y avisa con un warning al
 * arranque (server.ts). Si hay registros cifrados pero falta la clave,
 * descifrar tira un error explícito: mejor fallar cerrado que mandar el blob
 * cifrado a Meta/IMAP como si fuera el secreto real.
 */

const PREFIJO = 'enc:v1:';

/** Campos del config Json que son secretos y viajan cifrados en reposo. */
export const CAMPOS_SECRETOS = ['appSecret', 'pageAccessToken', 'pass'] as const;

const clave = (): Buffer | null => {
    const hex = env.INTEGRACIONES_SECRET_KEY;
    if (!hex) return null;
    return Buffer.from(hex, 'hex');
};

export const hayClaveDeSecretos = (): boolean => clave() !== null;

export const estaCifrado = (valor: unknown): boolean =>
    typeof valor === 'string' && valor.startsWith(PREFIJO);

/** Cifra un valor. Sin clave configurada, lo devuelve tal cual (modo claro). */
export function cifrarSecreto(plano: string): string {
    const k = clave();
    if (!k || !plano || estaCifrado(plano)) return plano;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
    const ct = Buffer.concat([cipher.update(plano, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIJO}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Descifra un valor cifrado; el texto plano legado pasa tal cual. */
export function descifrarSecreto(valor: string): string {
    if (!estaCifrado(valor)) return valor;
    const k = clave();
    if (!k) throw new Error('Hay secretos cifrados pero falta INTEGRACIONES_SECRET_KEY');
    const [iv, tag, ct] = valor.slice(PREFIJO.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

/** Cifra los campos secretos de un config de integración (el resto queda igual). */
export function cifrarConfig(config: Record<string, unknown>): Record<string, unknown> {
    const out = { ...config };
    for (const campo of CAMPOS_SECRETOS) {
        const v = out[campo];
        if (typeof v === 'string' && v) out[campo] = cifrarSecreto(v);
    }
    return out;
}
