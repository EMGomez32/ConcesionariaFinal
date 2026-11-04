import { env } from '../../config/env';
import { logger } from '../logging/logger';
import { enmascararEmail } from '../email/mailer';

/**
 * Notificador de ALERTAS de seguridad: lo que alguien tiene que mirar ya, no mañana en un
 * informe. Hasta ahora una racha de fuerza bruta o una sesión robada quedaban sólo en el
 * log y en security_events, y nadie se enteraba.
 *
 * Si `SECURITY_ALERT_WEBHOOK_URL` está definida, cada alerta sale como un POST JSON a esa
 * URL. Reglas:
 *  - Nunca bloquea ni rompe la operación que la origina: fire-and-forget, timeout corto y
 *    SIN reintentos (un receptor caído no puede encolar ni demorar logins).
 *  - Sin datos personales más allá de ids y el email ENMASCARADO. Ni IP, ni user-agent, ni
 *    tokens: el detalle completo vive en security_events, que sólo lee super_admin.
 *  - El evento ya quedó registrado antes de llamar acá; esto es sólo el aviso.
 */

export type TipoAlerta = 'brute_force_alert' | 'refresh_reuse' | 'super_admin_login';

export interface AlertaSeguridad {
    tipo: TipoAlerta;
    usuarioId?: number | null;
    concesionariaId?: number | null;
    /** Se manda enmascarado (ab***@dominio.com). */
    email?: string | null;
    /** Texto fijo que describe el evento. No meter datos del request acá. */
    detalle?: string;
}

const TIMEOUT_MS = 3000;

/** Cuerpo del POST. Exportado para el test: es el contrato con el receptor. */
export function cuerpoDeAlerta(a: AlertaSeguridad, ahora = new Date()) {
    return {
        origen: 'autenza',
        entorno: env.NODE_ENV,
        tipo: a.tipo,
        fecha: ahora.toISOString(),
        usuarioId: a.usuarioId ?? null,
        concesionariaId: a.concesionariaId ?? null,
        email: a.email ? enmascararEmail(a.email) : null,
        detalle: a.detalle ?? null,
    };
}

/** Manda la alerta si hay webhook configurado. Nunca lanza ni se espera. */
export function notificarAlertaSeguridad(a: AlertaSeguridad): void {
    const url = env.SECURITY_ALERT_WEBHOOK_URL;
    if (!url) return;
    void (async () => {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cuerpoDeAlerta(a)),
                signal: AbortSignal.timeout(TIMEOUT_MS),
                // Un 3xx no se sigue: la URL es la configurada, no otra.
                redirect: 'manual',
            });
            if (!res.ok) logger.warn(`[alertas] el webhook respondió ${res.status} a la alerta ${a.tipo}`);
        } catch (err) {
            // Sin la URL en el log: puede llevar un token del receptor.
            logger.warn(`[alertas] no se pudo enviar la alerta ${a.tipo}: ${err instanceof Error ? err.name : 'error'}`);
        }
    })();
}
