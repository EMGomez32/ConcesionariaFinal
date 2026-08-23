import crypto from 'crypto';
import { IntegracionCanal, OrigenLead } from '@prisma/client';
import { rawPrisma } from '../database/prisma';
import { logger } from '../logging/logger';
import { conContextoSistema, ingestarConsulta } from '../../application/services/consultaIngest';

/**
 * Webhook de Meta Lead Ads (Instagram/Facebook): verificación de suscripción
 * (GET), validación de firma HMAC del POST y procesamiento de cada leadgen —
 * pedir el lead al Graph API y pasarlo por la ingesta común de consultas.
 *
 * Corre SIN request autenticado: la integración se busca con rawPrisma (sin
 * extensión → sin contexto de tenant; activo y deletedAt se filtran A MANO) y
 * la ingesta corre bajo conContextoSistema(concesionariaId) para que la
 * extensión y la RLS scopeen todo al tenant dueño del canal.
 */

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

/** Forma del config Json de una integración tipo 'meta' (ver integracion.schema.ts). */
interface ConfigMeta {
    origen?: 'instagram' | 'facebook';
    verifyToken?: string;
    appSecret?: string;
    pageAccessToken?: string;
}

const mensajeCorto = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err)).slice(0, 300);

/** Integración meta viva y activa por id; null si no existe (→ 403 en la ruta). */
export async function buscarIntegracionMeta(integracionId: number): Promise<IntegracionCanal | null> {
    if (!Number.isInteger(integracionId) || integracionId <= 0) return null;
    // rawPrisma: query cross-tenant deliberada (el webhook no tiene tenant en
    // contexto); deletedAt y activo van filtrados explícitos porque la extensión
    // no aplica acá.
    return rawPrisma.integracionCanal.findFirst({
        where: { id: integracionId, tipo: 'meta', activo: true, deletedAt: null },
    });
}

/**
 * Handshake de suscripción (GET): si hub.mode === 'subscribe' y el token
 * coincide con el configurado, devuelve el challenge a responder en texto
 * plano; si no, null (→ 403).
 */
export function resolverVerificacionMeta(
    integracion: IntegracionCanal,
    query: Record<string, unknown>,
): string | null {
    const config = integracion.config as ConfigMeta | null;
    const modo = query['hub.mode'];
    const token = query['hub.verify_token'];
    if (modo === 'subscribe' && typeof token === 'string' && config?.verifyToken && token === config.verifyToken) {
        return String(query['hub.challenge'] ?? '');
    }
    return null;
}

/**
 * Valida X-Hub-Signature-256: 'sha256=' + HMAC-SHA256 hex del body CRUDO con
 * el appSecret del canal. Comparación en tiempo constante.
 */
export function validarFirmaMeta(
    rawBody: Buffer | undefined,
    firmaHeader: string | undefined,
    appSecret: string | undefined,
): boolean {
    if (!rawBody || !firmaHeader || !appSecret) return false;
    const esperada = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const a = Buffer.from(firmaHeader);
    const b = Buffer.from(esperada);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/**
 * Procesa una notificación ya firmada: por cada entry[].changes[] con
 * field 'leadgen', pide el lead al Graph API y lo ingesta como consulta del
 * tenant de la integración. Actualiza ultimoEvento (éxito) / ultimoError
 * (fallo). No tira: la ruta ya respondió 200 (Meta reintenta ante no-200).
 */
export async function procesarNotificacionMeta(integracion: IntegracionCanal, payload: unknown): Promise<void> {
    const config = (integracion.config ?? {}) as ConfigMeta;
    let ingeridas = 0;
    let ultimoErrorMsg: string | null = null;

    const entries = Array.isArray((payload as any)?.entry) ? (payload as any).entry : [];
    for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
            if (change?.field !== 'leadgen') continue;
            const leadgenId = change?.value?.leadgen_id;
            if (!leadgenId) continue;
            try {
                const lead = await obtenerLeadDeGraph(String(leadgenId), config.pageAccessToken ?? '');
                const origen: OrigenLead = config.origen ?? 'facebook';
                await conContextoSistema(integracion.concesionariaId, () =>
                    ingestarConsulta({ origen, ...lead }));
                ingeridas += 1;
            } catch (err) {
                ultimoErrorMsg = mensajeCorto(err);
                logger.error(`[meta-webhook] integración ${integracion.id} · leadgen ${leadgenId}: ${ultimoErrorMsg}`);
            }
        }
    }

    try {
        // rawPrisma con where por id: la fila ya se validó arriba; no hay contexto
        // de request para la extensión.
        await rawPrisma.integracionCanal.update({
            where: { id: integracion.id },
            data: {
                ...(ingeridas > 0 ? { ultimoEvento: new Date() } : {}),
                ultimoError: ultimoErrorMsg,
            },
        });
    } catch (err) {
        logger.error(`[meta-webhook] integración ${integracion.id}: no se pudo actualizar el estado: ${mensajeCorto(err)}`);
    }
    if (ingeridas > 0) {
        logger.info(`[meta-webhook] integración ${integracion.id}: ${ingeridas} consulta(s) ingerida(s)`);
    }
}

/** Pide el lead al Graph API y mapea field_data a los campos de la consulta. */
async function obtenerLeadDeGraph(leadgenId: string, pageAccessToken: string): Promise<{
    nombre: string;
    telefono: string | null;
    email: string | null;
    texto: string | null;
}> {
    const url = `${GRAPH_API_BASE}/${encodeURIComponent(leadgenId)}` +
        `?access_token=${encodeURIComponent(pageAccessToken)}&fields=field_data`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Graph API respondió ${res.status} para el lead ${leadgenId}`);
    }
    const data = (await res.json()) as { field_data?: unknown };
    return mapearFieldData(data?.field_data);
}

/**
 * field_data del Graph API: [{ name, values: [] }]. full_name/name → nombre,
 * phone_number/telefono → telefono, email → email; el resto se concatena al
 * texto de la consulta.
 */
function mapearFieldData(fieldData: unknown): {
    nombre: string;
    telefono: string | null;
    email: string | null;
    texto: string | null;
} {
    let nombre = '';
    let telefono: string | null = null;
    let email: string | null = null;
    const resto: string[] = [];
    for (const campo of Array.isArray(fieldData) ? fieldData : []) {
        const name = String(campo?.name ?? '').toLowerCase();
        const valor = Array.isArray(campo?.values) ? campo.values.filter(Boolean).join(', ').trim() : '';
        if (!valor) continue;
        if (name === 'full_name' || name === 'name') nombre = valor;
        else if (name === 'phone_number' || name === 'telefono') telefono = valor;
        else if (name === 'email') email = valor;
        else resto.push(`${campo.name}: ${valor}`);
    }
    return { nombre, telefono, email, texto: resto.length ? resto.join('\n') : null };
}
