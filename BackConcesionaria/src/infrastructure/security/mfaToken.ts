import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { JWT_ALGORITHM, JWT_ALGORITHMS } from './jwtOptions';

/**
 * Token de "contraseña correcta, falta el segundo factor": lo que devuelve el login cuando la cuenta
 * tiene 2FA. Dura 5 minutos y sirve SÓLO para POST /auth/login/2fa. Se firma con una clave DERIVADA
 * de JWT_SECRET con propósito propio: nunca lo acepta contextMiddleware como sesión (otra clave) ni
 * sirve como refresh.
 */
const TTL_SEG = 5 * 60;

const clave = (): Buffer => crypto.createHmac('sha256', env.JWT_SECRET).update('mfa-login-v1').digest();

export function emitirMfaToken(usuarioId: number): string {
    return jwt.sign({ sub: String(usuarioId), purpose: 'mfa' }, clave(), {
        expiresIn: TTL_SEG,
        algorithm: JWT_ALGORITHM,
        jwtid: crypto.randomUUID(),
    });
}

/** Devuelve el id de usuario o null si el token es inválido, vencido o de otro propósito. */
export function verificarMfaToken(token: unknown): number | null {
    if (typeof token !== 'string' || !token) return null;
    try {
        const p = jwt.verify(token, clave(), { algorithms: JWT_ALGORITHMS }) as jwt.JwtPayload;
        const id = Number(p.sub);
        return p.purpose === 'mfa' && Number.isInteger(id) && id > 0 ? id : null;
    } catch {
        return null;
    }
}

/** Id de usuario del token SIN verificar la firma: sólo para agrupar el rate limit por cuenta. */
export function usuarioDeMfaTokenSinVerificar(token: unknown): number | null {
    if (typeof token !== 'string') return null;
    const p = jwt.decode(token) as jwt.JwtPayload | null;
    const id = Number(p?.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
}
