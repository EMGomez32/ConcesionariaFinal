import type { CanalConversacion, Conversacion, MensajeWhatsapp, Prisma } from '@prisma/client';
import { logger } from '../logging/logger';
import { env } from '../../config/env';
import { whatsappManager } from '../../application/services/whatsappManager';
import { despacharMensajeMeta } from '../integraciones/metaEnvio';
import { withAuthBypass } from '../database/unitOfWork';

/**
 * Worker de envío de la bandeja — la cola de salida de TODOS los canales.
 *
 * AUTENZA no tiene Redis (y no se va a agregar), así que esto reemplaza a
 * BullMQ: la cola ES la tabla `mensajes_whatsapp`, y el "worker" es un
 * setInterval in-process que cada 3 segundos levanta un lote de pendientes
 * vencidos y los despacha por el transporte del canal de su conversación
 * (Baileys para WhatsApp, la API de Meta para los DM y los comentarios).
 *
 * Por qué el POST de la bandeja NO envía en el request:
 *   1. Anti-ban. Baileys es un cliente NO oficial: mandar ráfagas es la forma
 *      más rápida de que Meta banee el número. El espaciado lo fija quien crea
 *      el mensaje (calcula `enviarAt` avanzando el slot de la cuenta); el worker
 *      sólo respeta ese instante — nunca manda antes de `enviarAt`.
 *   2. Reintentos. Un socket caído no puede hacer fallar el request del panel:
 *      el mensaje queda pendiente y se reintenta con backoff.
 *
 * Ese espaciado es EXCLUSIVO de WhatsApp y vive en el encolado, no acá: para los
 * canales de Meta `enviarAt` es "ahora" (sus límites son cuotas de la app/página
 * y devuelven 429, no un riesgo de ban de la línea). El worker sólo respeta el
 * instante que le dejaron, así que sacarle el espaciado a Meta no se lo saca a
 * WhatsApp: son dos caminos distintos en `encolarSaliente`.
 *
 * Concurrencia: un solo proceso backend corre este worker, pero igual el claim
 * es atómico (updateMany condicionado a estado='pendiente'), así que dos ticks
 * superpuestos no despachan el mismo mensaje dos veces.
 */

const INTERVALO_MS = 3_000;
/** Tamaño del lote por tick. Con 3s de tick alcanza para cualquier ritmo humano. */
const LOTE = 10;
/** Cuenta pausada por salud: no se despacha nada, se reagenda para más tarde. */
const ESPERA_SALUD_MS = 5 * 60 * 1000;

/**
 * Política de REINTENTOS por canal. Es lo único del ritmo que vive en el worker
 * (el espaciado anti-ban lo fija `enviarAt` al encolar): qué hacer cuando un
 * envío falla.
 *
 * Está parametrizada por canal porque los dos transportes fallan distinto: un
 * socket de Baileys caído tarda en volver (backoff largo), mientras que un 429
 * de Meta es una cuota que se libera en segundos. Cambiar la curva de Meta NO
 * toca la de WhatsApp.
 */
interface PoliticaEnvio {
    maxIntentos: number;
    /**
     * Backoff por intento fallido, en ms. Sólo se usan los primeros
     * `maxIntentos - 1`: el intento número `maxIntentos` marca 'fallido' en vez
     * de reagendar, así que el último valor de la lista nunca se espera.
     */
    backoffMs: number[];
}

const POLITICA_WHATSAPP: PoliticaEnvio = { maxIntentos: 3, backoffMs: [30_000, 120_000, 600_000] };
const POLITICA_META: PoliticaEnvio = { maxIntentos: 3, backoffMs: [15_000, 60_000, 300_000] };

const politicaDe = (canal: CanalConversacion): PoliticaEnvio =>
    canal === 'whatsapp' ? POLITICA_WHATSAPP : POLITICA_META;

const mensajeCorto = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err)).slice(0, 300);

/** Tope de `mensaje.errorMensaje`: entra en una burbuja del chat, no es un log. */
const LIMITE_ERROR_MENSAJE = 300;
/** Tope del detalle técnico que va al log (el crudo de Meta con el fbtrace_id). */
const LIMITE_DETALLE_LOG = 1000;

/**
 * Texto que se GUARDA en `mensaje.errorMensaje`: lo que el vendedor lee dentro
 * del chat, en criollo y terminando en qué hacer.
 *
 * Los transportes que saben explicarse implementan `ErrorDeEnvio` y traen la
 * frase ya redactada (`mensajeVendedor`). Lo que no —los errores de Baileys, que
 * son de una librería ajena y llegan en inglés ('Connection Closed', 'Timed
 * Out', 'rate-overlimit')— cae en un texto fijo: un volcado de implementación
 * adentro del chat de un cliente no es accionable para quien está atendiendo, y
 * el detalle real va igual al log (ver `detalleTecnico`).
 */
const motivoParaVendedor = (err: unknown, canal: CanalConversacion): string => {
    const propuesto = (err as { mensajeVendedor?: unknown } | null)?.mensajeVendedor;
    if (typeof propuesto === 'string' && propuesto.trim()) {
        return propuesto.slice(0, LIMITE_ERROR_MENSAJE);
    }
    return canal === 'whatsapp'
        ? 'No se pudo enviar por WhatsApp: el número no está respondiendo. Si sigue fallando, avisale a un administrador para que revise la conexión.'
        : 'No se pudo enviar el mensaje. Si sigue fallando, avisale a un administrador.';
};

/**
 * Detalle TÉCNICO entero para el LOG: code, subcode, error_user_msg y el objeto
 * crudo de Meta con el fbtrace_id. Es lo único que sirve para debuggear una
 * integración a los seis meses, y por eso NO se recorta a los 300 caracteres que
 * alcanzan para un error de socket.
 *
 * Va al log y no a `errorMensaje` a propósito: son dos lectores distintos: el
 * vendedor mirando un chat y quien diagnostica la integración.
 */
const detalleTecnico = (err: unknown): string => {
    const detalle = (err as { detalleTecnico?: unknown } | null)?.detalleTecnico;
    return typeof detalle === 'string' && detalle.trim()
        ? detalle.slice(0, LIMITE_DETALLE_LOG)
        : mensajeCorto(err);
};

/**
 * ¿Reintentar lo arregla? Un rechazo de Meta puede ser permanente —permiso sin
 * aprobar, token vencido, ventana cerrada, comentario borrado— y ahí repetirlo
 * tres veces sólo demora el "fallido" que ya era seguro, dejando al vendedor
 * mirando un mensaje que nunca va a salir. Esos errores se marcan con
 * `reintentable: false` (ver `ErrorDeEnvio` en metaEnvio).
 *
 * Sin la marca se REINTENTA: es el comportamiento de siempre y el correcto para
 * una falla de red, así que WhatsApp —que no clasifica sus errores— se sigue
 * comportando exactamente igual que antes.
 *
 * Se mira la propiedad y no la clase del error a propósito: el worker despacha
 * por varios transportes y no tiene por qué conocer la jerarquía de excepciones
 * de cada uno. Alcanza con que marquen el error como permanente.
 */
const esReintentable = (err: unknown): boolean => {
    const marca = (err as { reintentable?: unknown } | null)?.reintentable;
    return typeof marca === 'boolean' ? marca : true;
};

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
    logger.info(`[bandeja-envio] worker iniciado: tick cada ${INTERVALO_MS / 1000}s, lotes de ${LOTE}`);
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
 * Cada paso es su propia transacción corta: el envío (socket de Baileys o HTTP a
 * Meta) es una llamada de red de varios segundos y NUNCA debe correr con una
 * transacción abierta.
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
                logger.error(`[bandeja-envio] mensaje ${mensaje.id}: ${mensajeCorto(err)}`);
            }
        }
    } catch (err) {
        logger.error(`[bandeja-envio] ciclo falló: ${mensajeCorto(err)}`);
    } finally {
        enProceso = false;
    }
}

/** La conversación con su cuenta de WhatsApp (null en los canales de Meta). */
type HiloDespacho = Conversacion & { whatsappCuenta: { saludEstado: string } | null };

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

    // La lectura de la conversación va DENTRO del try: si la base parpadea, el
    // mensaje tiene que volver a 'pendiente' con backoff. Quedarse afuera lo
    // dejaría clavado en 'enviando' para siempre — el estado que hace de lock.
    let conversacion: HiloDespacho | null = null;
    try {
        // El transporte sale de la conversación: el mensaje no guarda el canal
        // (una conversación pertenece a un solo canal y a una sola cuenta).
        conversacion = await enContextoSistema((tx) =>
            tx.conversacion.findFirst({
                where: { id: mensaje.conversacionId, deletedAt: null },
                include: { whatsappCuenta: { select: { saludEstado: true } } },
            }),
        ) as HiloDespacho | null;
        if (!conversacion) {
            await marcarFallido(mensaje, 'La conversación no existe o fue eliminada');
            return;
        }

        // El despacho de Meta revalida la ventana de 24 h antes de tocar la API
        // (el mensaje pudo pasar minutos en la cola y cruzar el límite): si se
        // cerró, tira un error NO reintentable con el motivo en criollo, que es
        // el que termina guardado en el mensaje.
        const idExterno = conversacion.canal === 'whatsapp'
            ? await despacharWhatsapp(mensaje, conversacion)
            : (await despacharMensajeMeta(conversacion, mensaje.contenido)).externoId;
        // `undefined` = WhatsApp decidió reagendar (no se envió nada todavía).
        if (idExterno !== undefined) await marcarEnviado(mensaje, conversacion.canal, idExterno);
    } catch (err) {
        // Si falló antes de saber el canal, la curva de WhatsApp es la
        // conservadora (la más espaciada de las dos).
        const canal = conversacion?.canal ?? 'whatsapp';
        // Dos textos distintos y a propósito: el criollo se guarda en el mensaje
        // (lo lee el vendedor en el chat) y el técnico va sólo al log.
        const motivo = motivoParaVendedor(err, canal);
        const detalle = detalleTecnico(err);
        if (!esReintentable(err)) {
            await marcarFallido(mensaje, motivo, detalle);
            return;
        }
        await manejarError(mensaje, canal, motivo, detalle);
    }
}

/**
 * WhatsApp por el socket de Baileys. Devuelve el waMessageId, o `undefined` si
 * el mensaje quedó reagendado por el circuit breaker de salud del número.
 */
async function despacharWhatsapp(
    mensaje: MensajeWhatsapp,
    conversacion: HiloDespacho,
): Promise<string | null | undefined> {
    if (!conversacion.whatsappCuentaId || !conversacion.telefono) {
        await marcarFallido(mensaje, 'La conversación de WhatsApp no tiene número asociado');
        return undefined;
    }

    // Circuit breaker de salud del número: si la cuenta está pausada, no se
    // manda NADA por ella (es justamente la señal de que Meta la está
    // mirando). No consume intento: se reagenda y se reevalúa en 5 minutos.
    // Es anti-ban puro y por eso vive SÓLO en esta rama.
    if (conversacion.whatsappCuenta?.saludEstado === 'pausado') {
        await reagendar(mensaje, ESPERA_SALUD_MS);
        logger.warn(`[bandeja-envio] mensaje ${mensaje.id}: cuenta ${conversacion.whatsappCuentaId} pausada por salud, reagendado +5min`);
        return undefined;
    }

    const { waMessageId } = await whatsappManager.enviar(
        conversacion.whatsappCuentaId,
        conversacion.telefono,
        mensaje.contenido,
    );
    return waMessageId ?? null;
}

/**
 * Guarda el id que devolvió el proveedor en la columna de su canal: WhatsApp en
 * `waMessageId` (lo matchea el ack de entrega/lectura de Baileys), Meta en
 * `externoId` (el mismo campo con el que la ingesta deduplica los reintentos del
 * webhook, para que un echo no vuelva a insertar el mensaje que ya mandamos).
 */
async function marcarEnviado(
    mensaje: MensajeWhatsapp,
    canal: CanalConversacion,
    idExterno: string | null,
): Promise<void> {
    const ahora = new Date();
    const idPorCanal = !idExterno
        ? {}
        : canal === 'whatsapp'
            ? { waMessageId: idExterno }
            : { externoId: idExterno };
    const data: Prisma.MensajeWhatsappUpdateInput = {
        estado: 'enviado',
        enviadoEn: ahora,
        errorMensaje: null,
        ...idPorCanal,
    };
    try {
        await enContextoSistema((tx) => tx.mensajeWhatsapp.update({ where: { id: mensaje.id }, data }));
    } catch (err) {
        // Único choque posible: el unique del id externo dentro de la
        // conversación (el eco del propio mensaje ya lo guardó desde el socket o
        // desde el webhook). El envío SÍ salió, así que el mensaje se marca
        // enviado igual, sin el id — dejarlo en 'enviando' sería mentirle al
        // panel para siempre.
        logger.warn(`[bandeja-envio] mensaje ${mensaje.id}: no se pudo guardar el id del proveedor (${mensajeCorto(err)})`);
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

/**
 * Falla definitiva sin gastar reintentos (el problema no se arregla esperando).
 *
 * `motivo` es lo que se guarda y lee el vendedor; `detalle` es el técnico, que
 * sólo se loguea. Cuando no viene, el motivo ya ES el detalle (los avisos que
 * escribe el propio worker están en criollo y no tienen nada más atrás).
 */
async function marcarFallido(mensaje: MensajeWhatsapp, motivo: string, detalle?: string): Promise<void> {
    await enContextoSistema((tx) =>
        tx.mensajeWhatsapp.update({
            where: { id: mensaje.id },
            data: { estado: 'fallido', errorMensaje: motivo },
        }),
    );
    logger.error(`[bandeja-envio] mensaje ${mensaje.id} fallido: ${detalle ?? motivo}`);
}

/** Falla de envío: reintenta con backoff hasta maxIntentos, después fallido. */
async function manejarError(
    mensaje: MensajeWhatsapp,
    canal: CanalConversacion,
    motivo: string,
    detalle?: string,
): Promise<void> {
    const politica = politicaDe(canal);
    const intentos = mensaje.intentos + 1;

    if (intentos >= politica.maxIntentos) {
        await enContextoSistema((tx) =>
            tx.mensajeWhatsapp.update({
                where: { id: mensaje.id },
                data: { estado: 'fallido', intentos, errorMensaje: motivo },
            }),
        );
        logger.error(`[bandeja-envio] mensaje ${mensaje.id} (${canal}) fallido tras ${intentos} intento(s): ${detalle ?? motivo}`);
        return;
    }

    const espera = politica.backoffMs[intentos - 1] ?? politica.backoffMs[politica.backoffMs.length - 1];
    await enContextoSistema((tx) =>
        tx.mensajeWhatsapp.update({
            where: { id: mensaje.id },
            data: { estado: 'pendiente', intentos, errorMensaje: motivo, enviarAt: dentroDe(espera) },
        }),
    );
    logger.warn(`[bandeja-envio] mensaje ${mensaje.id} (${canal}) falló (intento ${intentos}/${politica.maxIntentos}), reintenta en ${espera / 1000}s: ${detalle ?? motivo}`);
}
