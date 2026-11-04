import { context } from './context';
import { withAuthBypass } from '../database/unitOfWork';
import { logger } from '../logging/logger';
import { recordSecurityEvent } from './securityEvents';

// 'refinanciar' mueve deuda de un contrato a otro: merece su propio rastro y no
// confundirse con un 'create' cualquiera.
// 'delete_soft' es la baja lógica (la de la mayoría de recursos). 'delete' es la
// baja FÍSICA, reservada para datos de referencia sin soft-delete (p. ej. cotizaciones).
type AccionAudit =
    | 'create' | 'update' | 'cancel' | 'delete_soft' | 'delete' | 'login' | 'logout' | 'refinanciar'
    | 'login_fail' | 'password_reset_request' | 'password_reset_done';

interface AuditParams {
    entidad: string;
    entidadId?: number | null;
    accion: AccionAudit;
    detalle?: string;
    concesionariaId?: number | null;
    usuarioId?: number | null;
    /** Para flujos fuera de la sesión (login fallido, recuperación): el contexto no los tiene. */
    ip?: string | null;
    userAgent?: string | null;
}

// Fire-and-forget audit log writer. Pulls user/ip/userAgent from the
// AsyncLocalStorage context — callers don't need to thread `req` through.
// Failures are logged but never thrown, so a busted audit insert can't
// break the operation that triggered it.
export async function audit(params: AuditParams): Promise<void> {
    try {
        const user = context.getUser();
        const concesionariaId = params.concesionariaId ?? user?.concesionariaId ?? null;

        if (!concesionariaId) {
            // Sin tenant (típicamente super_admin) audit_log no puede guardarlo: concesionaria_id
            // es NOT NULL con FK. Antes se DESCARTABA con un warn, así que lo que hace un
            // super_admin —crear usuarios, otorgar super_admin— no dejaba rastro. Ahora va a
            // security_events (sin tenant), que sólo lee super_admin.
            await recordSecurityEvent({
                accion: params.accion,
                entidad: params.entidad,
                entidadId: params.entidadId,
                usuarioId: params.usuarioId ?? user?.userId ?? null,
                detalle: params.detalle,
                ip: params.ip ?? context.getIp() ?? null,
                userAgent: params.userAgent ?? context.getUserAgent() ?? null,
            });
            return;
        }

        // withAuthBypass: el audit_log tiene RLS. En flujos SIN tenant en contexto
        // (login/logout) el INSERT lo rechazaría el WITH CHECK bajo app_rw. El row
        // siempre lleva su concesionariaId explícito, así que saltear la RLS acá es
        // seguro (escritura interna confiable) y garantiza que el rastro se escriba.
        await withAuthBypass((tx) => tx.auditLog.create({
            data: {
                concesionariaId,
                usuarioId: params.usuarioId ?? user?.userId ?? null,
                entidad: params.entidad,
                entidadId: params.entidadId ?? null,
                accion: params.accion,
                detalle: params.detalle ?? null,
                ip: params.ip ?? context.getIp() ?? null,
                userAgent: params.userAgent ?? context.getUserAgent() ?? null,
            } as any,
        }));
    } catch (err) {
        logger.error('[audit] failed to write audit log', { err, params });
    }
}
