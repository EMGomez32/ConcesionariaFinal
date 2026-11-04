import crypto from 'crypto';
import { rawPrisma } from '../database/prisma';
import { logger } from '../logging/logger';

/**
 * Rastro de seguridad SIN tenant (tabla security_events).
 *
 * audit_log es por concesionaria (concesionaria_id NOT NULL + FK + RLS), así que no
 * puede guardar lo que no tiene tenant: acciones de super_admin, intentos de login
 * contra emails que no existen, alertas de fuerza bruta. Eso vive acá.
 *
 * - No guarda el email, sólo un hash: permite contar intentos contra un mismo
 *   objetivo sin acumular direcciones ajenas (y sin PII en el rastro).
 * - Nunca lanza: un fallo de escritura no puede romper la operación que lo origina.
 * - Usa el cliente raw a propósito: la tabla no tiene tenant ni RLS.
 */

export interface SecurityEventInput {
    accion: string;
    entidad?: string | null;
    entidadId?: number | null;
    usuarioId?: number | null;
    concesionariaId?: number | null;
    /** Se guarda hasheado, nunca en claro. */
    email?: string | null;
    detalle?: string | null;
    ip?: string | null;
    userAgent?: string | null;
}

/** Hash corto y estable del email (normalizado). Sirve para agrupar, no para revertir. */
export function hashEmail(email: string): string {
    return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

const recortar = (s: string | null | undefined, max: number): string | null =>
    s ? (s.length > max ? s.slice(0, max) : s) : null;

export async function recordSecurityEvent(ev: SecurityEventInput): Promise<void> {
    try {
        await rawPrisma.securityEvent.create({
            data: {
                accion: ev.accion,
                entidad: ev.entidad ?? null,
                entidadId: ev.entidadId ?? null,
                usuarioId: ev.usuarioId ?? null,
                concesionariaId: ev.concesionariaId ?? null,
                emailHash: ev.email ? hashEmail(ev.email) : null,
                detalle: recortar(ev.detalle, 1000),
                ip: recortar(ev.ip, 64),
                userAgent: recortar(ev.userAgent, 255),
            },
        });
    } catch (err) {
        logger.error('[security] no se pudo escribir security_events', { err, accion: ev.accion });
    }
}
