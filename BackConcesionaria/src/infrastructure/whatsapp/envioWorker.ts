import type { MensajeWhatsapp, Prisma } from '@prisma/client';
import { rawPrisma } from '../database/prisma';
import { logger } from '../logging/logger';
import { env } from '../../config/env';
import { whatsappManager } from '../../application/services/whatsappManager';
import { withAuthBypass } from '../database/unitOfWork';

/**
 * Worker de envío de mensajes de WhatsApp — la cola de salida de la bandeja.
 *
 * AUTENZA no tiene Redis (y no se va a agregar), así que esto reemplaza a
 * BullMQ: la cola ES la tabla `mensajes_whatsapp`, y el "worker" es un
 * setInterval in-process que cada 3 segundos levanta un lote de pendientes
 * vencidos y los despacha.
 *
 * Por qué el POST de la bandeja NO envía en el request:
 *   1. Anti-ban. Baileys es un cliente NO oficial: mandar ráfagas es la forma
 *      más rápida de que Meta banee el número. El espaciado lo fija quien crea
 *      el mensaje (calcula `enviarAt` avanzando el slot de la cuenta); el worker
 *      sólo respeta ese instante — nunca manda antes de `enviarAt`.
 *   2. Reintentos. Un socket caído no puede hacer fallar el request del panel:
 *      el mensaje queda pendiente y se reintenta con backoff.
 *
 * Concurrencia: un solo proceso backend corre este worker, pero igual el claim
 * es atómico (updateMany condicionado a estado='pendiente'), así que dos ticks
 * superpuestos no despachan el mismo mensaje dos veces.
 */

const INTERVALO_MS = 3_000;
/** Tamaño del lote por tick. Con 3s de tick alcanza para cualquier ritmo humano. */
const LOTE = 10;
const MAX_INTENTOS = 3;
/** Backoff por intento fallido: 30s, 2min, 10min. */
const BACKOFF_MS = [30_000, 120_000, 600_000];
/** Cuenta pausada por salud: no se despacha nada, se reagenda para más tarde. */
const ESPERA_SALUD_MS = 5 * 60 * 1000;

const mensajeCorto = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err)).slice(0, 300);

const dentroDe = (ms: number): Date => new Date(Date.now() + ms);

let enProceso = false;

/**
 * Arranca el worker: un tick cada 3 segundos. NUNCA en tests (doble guarda:
 * acá y en server.ts) — un setInterval vivo deja a Jest colgado y, peor, tocaría
 * la base de la suite.
 */
export function iniciarWorkerEnvioWhatsapp(): void {
    if (env.NODE_ENV === 'test') return;
    setInterval(() => { void correrCiclo(); }, INTERVALO_MS).unref();
    logger.info(`[whatsapp-envio] worker iniciado: tick cada ${INTERVALO_MS / 1000}s, lotes de ${LOTE}`);
}

/**
 * Corre las queries del worker con el flag de RLS de sistema prendido.
 *
 * El worker es deliberadamente CROSS-TENANT (atiende a todas las
 * concesionarias) y no tiene request en contexto, así que va por `rawPrisma`,
 * que NO pasa por la extensión de Prisma y por lo tanto no setea
 * `app.tenant_id`. Con el runtime corriendo como `app_rw` (NOSUPERUSER,
 * NOBYPASSRLS) las policies `tenant_iso` filtrarían TODAS las filas y el worker
 * no vería un solo mensaje. Prender `app.is_super_admin` dentro de la
 * transacción es el mismo mecanismo que usa la extensión para el super_admin;
 * el flag es transaction-local (tercer parámetro `true`), así que no se filtra a
 * otras queries del pool.
 *
 * Cada paso es su propia transacción corta: el envío por Baileys es una llamada
 * de red de varios segundos y NUNCA debe correr con una transacción abierta.
 */
const enContextoSistema = withAuthBypass;

async function correrCiclo(): Promise<void> {
    // Guard de reentrada: un lote lento (socket colgado) no se pisa con el
    // siguiente tick. Silencioso a propósito — con ticks de 3s, loguear cada
    // salteo inundaría el log.
    if (enProceso) return;
    enProceso = true;
    try {
        // Sin la extensión, `deletedAt: null` se filtra A MANO.
        const pendientes = await enContextoSistema((tx) =>
            tx.mensajeWhatsapp.findMany({
                where: { estado: 'pendiente', deletedAt: null, enviarAt: { lte: new Date() } },
                orderBy: { enviarAt: 'asc' },
                take: LOTE,
            }),
        );
        for (const mensaje of pendientes) {
            try {
                await despachar(mensaje);
            } catch (err) {
                // Un mensaje podrido (o un update que falla) no corta el lote.
                logger.error(`[whatsapp-envio] mensaje ${mensaje.id}: ${mensajeCorto(err)}`);
            }
        }
    } catch (err) {
        logger.error(`[whatsapp-envio] ciclo falló: ${mensajeCorto(err)}`);
    } finally {
        enProceso = false;
    }
}

async function despachar(mensaje: MensajeWhatsapp): Promise<void> {
    // Claim atómico: si otro tick ya lo tomó, el update no afecta filas y este
    // lo saltea. El estado 'enviando' es lo que hace de lock.
    const { count } = await enContextoSistema((tx) =>
        tx.mensajeWhatsapp.updateMany({
            where: { id: mensaje.id, estado: 'pendiente' },
            data: { estado: 'enviando' },
        }),
    );
    if (count === 0) return;

    try {
        // La cuenta que despacha sale de la conversación: el mensaje no la
        // guarda (una conversación pertenece a un solo número).
        const conversacion = await enContextoSistema((tx) =>
            tx.conversacion.findFirst({
                where: { id: mensaje.conversacionId, deletedAt: null },
                include: { whatsappCuenta: true },
            }),
        );
        if (!conversacion) {
            await marcarFallido(mensaje, 'La conversación no existe o fue eliminada');
            return;
        }

        // Circuit breaker de salud del número: si la cuenta está pausada, no se
        // manda NADA por ella (es justamente la señal de que Meta la está
        // mirando). No consume intento: se reagenda y se reevalúa en 5 minutos.
        if (conversacion.whatsappCuenta.saludEstado === 'pausado') {
            await reagendar(mensaje, ESPERA_SALUD_MS);
            logger.warn(`[whatsapp-envio] mensaje ${mensaje.id}: cuenta ${conversacion.whatsappCuentaId} pausada por salud, reagendado +5min`);
            return;
        }

        const { waMessageId } = await whatsappManager.enviar(
            conversacion.whatsappCuentaId,
            conversacion.telefono,
            mensaje.contenido,
        );
        await marcarEnviado(mensaje, waMessageId ?? null);
    } catch (err) {
        await manejarError(mensaje, mensajeCorto(err));
    }
}

async function marcarEnviado(mensaje: MensajeWhatsapp, waMessageId: string | null): Promise<void> {
    const ahora = new Date();
    const data: Prisma.MensajeWhatsappUpdateInput = {
        estado: 'enviado',
        enviadoEn: ahora,
        errorMensaje: null,
        ...(waMessageId ? { waMessageId } : {}),
    };
    try {
        await enContextoSistema((tx) => tx.mensajeWhatsapp.update({ where: { id: mensaje.id }, data }));
    } catch (err) {
        // Único choque posible: [conversacionId, waMessageId] (el eco del propio
        // mensaje ya lo guardó desde el socket). El envío SÍ salió, así que el
        // mensaje se marca enviado igual, sin el id — dejarlo en 'enviando'
        // sería mentirle al panel para siempre.
        logger.warn(`[whatsapp-envio] mensaje ${mensaje.id}: no se pudo guardar el waMessageId (${mensajeCorto(err)})`);
        await enContextoSistema((tx) =>
            tx.mensajeWhatsapp.update({
                where: { id: mensaje.id },
                data: { estado: 'enviado', enviadoEn: ahora, errorMensaje: null },
            }),
        );
    }
}

/** Vuelve a 'pendiente' para más tarde SIN consumir un intento. */
async function reagendar(mensaje: MensajeWhatsapp, esperaMs: number): Promise<void> {
    await enContextoSistema((tx) =>
        tx.mensajeWhatsapp.update({
            where: { id: mensaje.id },
            data: { estado: 'pendiente', enviarAt: dentroDe(esperaMs) },
        }),
    );
}

/** Falla definitiva sin gastar reintentos (el problema no se arregla esperando). */
async function marcarFallido(mensaje: MensajeWhatsapp, motivo: string): Promise<void> {
    await enContextoSistema((tx) =>
        tx.mensajeWhatsapp.update({
            where: { id: mensaje.id },
            data: { estado: 'fallido', errorMensaje: motivo },
        }),
    );
    logger.error(`[whatsapp-envio] mensaje ${mensaje.id} fallido: ${motivo}`);
}

/** Falla de envío: reintenta con backoff hasta MAX_INTENTOS, después fallido. */
async function manejarError(mensaje: MensajeWhatsapp, motivo: string): Promise<void> {
    const intentos = mensaje.intentos + 1;

    if (intentos >= MAX_INTENTOS) {
        await enContextoSistema((tx) =>
            tx.mensajeWhatsapp.update({
                where: { id: mensaje.id },
                data: { estado: 'fallido', intentos, errorMensaje: motivo },
            }),
        );
        logger.error(`[whatsapp-envio] mensaje ${mensaje.id} fallido tras ${intentos} intento(s): ${motivo}`);
        return;
    }

    const espera = BACKOFF_MS[intentos - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
    await enContextoSistema((tx) =>
        tx.mensajeWhatsapp.update({
            where: { id: mensaje.id },
            data: { estado: 'pendiente', intentos, errorMensaje: motivo, enviarAt: dentroDe(espera) },
        }),
    );
    logger.warn(`[whatsapp-envio] mensaje ${mensaje.id} falló (intento ${intentos}/${MAX_INTENTOS}), reintenta en ${espera / 1000}s: ${motivo}`);
}
