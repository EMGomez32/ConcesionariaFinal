import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { IntegracionCanal, OrigenLead } from '@prisma/client';
import { rawPrisma } from '../database/prisma';
import { withAuthBypass } from '../database/unitOfWork';
import { logger } from '../logging/logger';
import { env } from '../../config/env';
import { conContextoSistema, ingestarConsulta } from '../../application/services/consultaIngest';
import { descifrarSecreto } from '../security/secretBox';

/**
 * Worker de ingesta de consultas por email (avisos de DeRuedas y similares):
 * cada 5 minutos recorre las integraciones tipo 'email' activas de TODOS los
 * tenants, lee los mails sin leer de cada casilla IMAP y los pasa por la
 * ingesta común de consultas bajo el contexto del tenant dueño del canal.
 *
 * Un mail se marca \Seen SOLO si su ingesta no tiró: los fallidos quedan sin
 * leer y se reintentan en el próximo ciclo.
 */

const INTERVALO_MS = 5 * 60 * 1000;
const ARRANQUE_MS = 30 * 1000;

/** Forma del config Json de una integración tipo 'email' (ver integracion.schema.ts). */
interface ConfigEmail {
    origen?: OrigenLead;
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    carpeta?: string;
}

// Primer teléfono argentino plausible en el cuerpo del mail.
const REGEX_TELEFONO = /(?:\+?54)?[\s.-]?(?:9[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/;

const mensajeCorto = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err)).slice(0, 300);

// El From de los avisos suele ser la casilla del sistema (no-reply de DeRuedas):
// no sirve como email del interesado. El email real viene en Reply-To o en el cuerpo.
const esRemitenteSistema = (address: string): boolean =>
    /no[-_.]?reply|notificacion|notification|aviso|mailer|deruedas/i.test(address);

let enProceso = false;

/**
 * Arranca el worker: una corrida inicial a los 30s del boot y luego una cada
 * 5 minutos. NUNCA en tests (doble guarda: acá y en server.ts).
 */
export function iniciarWorkerIngestaEmail(): void {
    if (env.NODE_ENV === 'test') return;
    setTimeout(() => { void correrCiclo(); }, ARRANQUE_MS).unref();
    setInterval(() => { void correrCiclo(); }, INTERVALO_MS).unref();
    logger.info('[email-ingest] worker iniciado: corrida inicial en 30s, luego cada 5 min');
}

async function correrCiclo(): Promise<void> {
    if (enProceso) {
        logger.warn('[email-ingest] ciclo anterior todavía en curso, se saltea esta corrida');
        return;
    }
    enProceso = true;
    try {
        // Barrido cross-tenant deliberado (el worker atiende todas las
        // concesionarias). TIENE que ir por withAuthBypass, no por rawPrisma
        // pelado: en runtime la app se conecta como app_rw (sin BYPASSRLS), y
        // la policy tenant_iso exige app.tenant_id o app.is_super_admin — sin
        // esas GUC el findMany devuelve CERO filas EN SILENCIO y el worker no
        // procesa ninguna casilla. Verificado contra prod: 0 sin bypass vs 5
        // con bypass sobre la misma tabla. Sin la extensión, activo y deletedAt
        // se filtran A MANO.
        const integraciones = await withAuthBypass((tx) => tx.integracionCanal.findMany({
            where: { tipo: 'email', activo: true, deletedAt: null },
            orderBy: { id: 'asc' },
        }));
        for (const integracion of integraciones) {
            await procesarIntegracion(integracion);
        }
    } catch (err) {
        logger.error(`[email-ingest] ciclo falló: ${mensajeCorto(err)}`);
    } finally {
        enProceso = false;
    }
}

async function procesarIntegracion(integracion: IntegracionCanal): Promise<void> {
    const config = (integracion.config ?? {}) as ConfigEmail;
    let ingeridas = 0;
    let ultimoErrorMsg: string | null = null;
    try {
        // Contexto sintético del tenant: la extensión de Prisma scopea la ingesta
        // (dedupe, round-robin, create) a la concesionaria dueña del canal.
        const resultado = await conContextoSistema(integracion.concesionariaId, () => revisarCasilla(config));
        ingeridas = resultado.ingeridas;
        ultimoErrorMsg = resultado.error;
    } catch (err) {
        ultimoErrorMsg = mensajeCorto(err);
        logger.error(`[email-ingest] integración ${integracion.id} (${integracion.nombre}): ${ultimoErrorMsg}`);
    }
    try {
        // Igual que la lectura: con app_rw la policy tenant_iso también aplica a
        // los UPDATE, así que sin el bypass este update afecta 0 filas en
        // silencio y el diagnóstico de Ajustes nunca se actualiza.
        await withAuthBypass((tx) => tx.integracionCanal.update({
            where: { id: integracion.id },
            data: {
                ...(ingeridas > 0 ? { ultimoEvento: new Date() } : {}),
                ultimoError: ultimoErrorMsg,
            },
        }));
    } catch (err) {
        logger.error(`[email-ingest] integración ${integracion.id}: no se pudo actualizar el estado: ${mensajeCorto(err)}`);
    }
    if (ingeridas > 0) {
        logger.info(`[email-ingest] integración ${integracion.id}: ${ingeridas} consulta(s) ingerida(s)`);
    }
}

/** Conecta a la casilla, procesa los UNSEEN y devuelve el balance de la corrida. */
async function revisarCasilla(config: ConfigEmail): Promise<{ ingeridas: number; error: string | null }> {
    const client = new ImapFlow({
        host: config.host ?? '',
        port: config.port ?? 993,
        secure: config.secure ?? true,
        auth: { user: config.user ?? '', pass: config.pass ? descifrarSecreto(config.pass) : '' },
        logger: false,
    });
    let ingeridas = 0;
    let error: string | null = null;
    await client.connect();
    try {
        const lock = await client.getMailboxLock(config.carpeta || 'INBOX');
        try {
            const uids = (await client.search({ seen: false }, { uid: true })) || [];
            for (const uid of uids) {
                try {
                    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
                    if (!msg || !msg.source) continue;
                    const consulta = await extraerConsulta(msg.source);
                    await ingestarConsulta({ origen: config.origen ?? 'deruedas', ...consulta });
                    ingeridas += 1;
                    // \Seen SOLO tras la ingesta OK: un mail fallido queda sin leer
                    // y se reintenta en el próximo ciclo.
                    await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
                } catch (err) {
                    // Un mail podrido no corta el resto de la casilla.
                    error = mensajeCorto(err);
                    logger.error(`[email-ingest] mail uid=${uid} falló: ${error}`);
                }
            }
        } finally {
            lock.release();
        }
    } finally {
        // Cerrar SIEMPRE: logout amable y, si el socket ya murió, cierre seco.
        await client.logout().catch(() => client.close());
    }
    return { ingeridas, error };
}

/** Parsea el mail y extrae los campos de la consulta. */
async function extraerConsulta(source: Buffer): Promise<{
    nombre: string;
    telefono: string | null;
    email: string | null;
    texto: string;
}> {
    const parsed = await simpleParser(source);
    const cuerpo = (parsed.text ?? '').trim();

    // Nombre: display name del From, o primera línea "Nombre: X" del cuerpo.
    const remitente = parsed.from?.value?.[0];
    const nombreFrom = remitente?.name?.trim();
    const nombreCuerpo = cuerpo.match(/^\s*Nombre:\s*(.+)$/im)?.[1]?.trim();
    const nombre = nombreFrom || nombreCuerpo || '';

    const telefono = cuerpo.match(REGEX_TELEFONO)?.[0]?.trim() ?? null;

    // Email del interesado: Reply-To, o el From salvo que sea la casilla del
    // sistema de avisos.
    const replyTo = parsed.replyTo?.value?.[0]?.address;
    const fromEmail = remitente?.address;
    const email = replyTo || (fromEmail && !esRemitenteSistema(fromEmail) ? fromEmail : null);

    const asunto = (parsed.subject ?? '').trim();
    return {
        nombre,
        telefono,
        email: email ?? null,
        texto: `${asunto}\n\n${cuerpo.slice(0, 1500)}`.trim(),
    };
}
