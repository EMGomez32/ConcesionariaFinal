import crypto from 'crypto';
import { IntegracionCanal, OrigenLead } from '@prisma/client';
import { withAuthBypass } from '../database/unitOfWork';
import { logger } from '../logging/logger';
import { conContextoSistema, ingestarConsulta } from '../../application/services/consultaIngest';
import { descifrarSecreto } from '../security/secretBox';
import { ConfigMeta, canalMetaHabilitado, idDeCuentaMeta } from '../../domain/services/canalesMeta';
import { llamarGraph } from './metaEnvio';
import {
    ContextoNotificacion,
    EventoEntranteMeta,
    fechaDeEntry,
    ingestarEventoMeta,
    normalizarComentarioFeed,
    normalizarComentarioInstagram,
    normalizarMensajeria,
} from './metaCanales';

/**
 * Webhook de Meta: verificación de suscripción (GET), validación de firma HMAC
 * del POST y RUTEO de cada evento al canal que corresponda.
 *
 * Cinco cosas entran por ESTA MISMA URL (Meta manda todo al callback de la app;
 * el tenant sale del `:integracionId` del path, no del id de la página):
 *
 *   object        campo       → qué es
 *   ─────────────────────────────────────────────────────────────────────────
 *   page          leadgen     → formulario de campaña (Lead Ads)  [el original]
 *   page          messages    → DM de Messenger        (en entry[].messaging[])
 *   page          feed        → comentario en la página de Facebook
 *   instagram     messages    → DM de Instagram        (en entry[].messaging[])
 *   instagram     comments    → comentario en una publicación de Instagram
 *
 * OJO con la forma del payload: el leadgen y los comentarios vienen en
 * `entry[].changes[]`, pero los DM vienen en `entry[].messaging[]`, un array
 * HERMANO. Por eso se recorren los dos: mirando sólo `changes` los DM entran,
 * validan firma, contestan 200 y se pierden sin dejar rastro.
 *
 * Corre SIN request autenticado: la integración se busca con withAuthBypass (sin
 * contexto de tenant; activo y deletedAt se filtran A MANO) y la ingesta corre
 * bajo conContextoSistema(concesionariaId) para que la extensión y la RLS
 * scopeen todo al tenant dueño del canal.
 *
 * Y corre DESPUÉS del 200 (la ruta responde antes de llamar acá, porque Meta
 * corta los webhooks lentos): nada de lo que pasa en este archivo puede tirar
 * sin capturar — no hay a quién devolverle el error.
 */

export type { ConfigMeta };

const mensajeCorto = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err)).slice(0, 300);

/** Integración meta viva y activa por id; null si no existe (→ 403 en la ruta). */
export async function buscarIntegracionMeta(integracionId: number): Promise<IntegracionCanal | null> {
    if (!Number.isInteger(integracionId) || integracionId <= 0) return null;
    // Query cross-tenant deliberada (el webhook no tiene tenant en contexto).
    // VA POR withAuthBypass, no por rawPrisma pelado: el runtime se conecta como
    // app_rw (sin BYPASSRLS) y la policy tenant_iso exige app.tenant_id o
    // app.is_super_admin — sin esas GUC este findFirst devuelve null SIEMPRE y
    // el webhook responde 403 a todos los leads de Meta, en silencio.
    // deletedAt y activo van filtrados explícitos porque la extensión no aplica.
    return withAuthBypass((tx) => tx.integracionCanal.findFirst({
        where: { id: integracionId, tipo: 'meta', activo: true, deletedAt: null },
    }));
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
 * Procesa una notificación ya firmada y rutea cada evento a su canal (ver el
 * cuadro de la cabecera del archivo). Actualiza ultimoEvento (éxito) /
 * ultimoError (fallo). No tira: la ruta ya respondió 200.
 */
export async function procesarNotificacionMeta(integracion: IntegracionCanal, payload: unknown): Promise<void> {
    const config = (integracion.config ?? {}) as ConfigMeta;

    // `object` es EL discriminador de Meta y hasta ahora no se leía. Hace falta
    // para desambiguar Messenger de DM de Instagram: los dos llegan en
    // `entry[].messaging[]` con una forma casi idéntica, y lo único que los
    // distingue es este campo.
    const objeto = texto((payload as any)?.object);

    // Ids de la página y de la cuenta de IG: sirven para reconocer NUESTROS
    // propios comentarios volviendo por el webhook (el equivalente al is_echo
    // de los DM). Si no están cargados se cae al `entry.id`, que en la práctica
    // es el mismo id — por eso no tenerlos no rompe la ingesta.
    const idsPropios = [idDeCuentaMeta(config, 'page'), idDeCuentaMeta(config, 'instagram')]
        .filter((v): v is string => !!v);

    // Id que ESPERAMOS en entry.id para este objeto (null si el admin todavía no
    // lo cargó). En Meta la URL de callback se suscribe por APP, no por página:
    // varias páginas de la misma app notifican a esta misma URL, o sea al mismo
    // :integracionId. Sin este chequeo entraban a la bandeja hilos de una página
    // que esta integración no puede contestar (el envío sale con el ÚNICO pageId
    // del config y Meta lo rechaza), sin ninguna señal de por qué.
    const idEsperado = objeto === 'page' || objeto === 'instagram'
        ? idDeCuentaMeta(config, objeto)
        : null;

    let procesados = 0;
    let duplicados = 0;
    let ultimoErrorMsg: string | null = null;

    const anotarError = (contexto: string, err: unknown): void => {
        ultimoErrorMsg = `${contexto}: ${mensajeCorto(err)}`;
        logger.error(`[meta-webhook] integración ${integracion.id} · ${ultimoErrorMsg}`);
    };

    /** Ingesta común de DM y comentarios: normalizar arriba, persistir acá. */
    const ingerir = async (evento: EventoEntranteMeta | null, contexto: string): Promise<void> => {
        if (!evento) return;
        // El evento entra IGUAL aunque falte configurar el canal: descartar el
        // mensaje de un cliente porque falta un id sería tragarse un lead en
        // silencio, que es peor. Pero queda el rastro de por qué ese hilo no se
        // va a poder contestar (el composer se lo dice al vendedor con el mismo
        // texto; esto es para quien mire el log).
        if (!canalMetaHabilitado(config, evento.canal)) {
            logger.warn(
                `[meta-webhook] integración ${integracion.id}: entra un ${contexto} pero el canal `
                + `'${evento.canal}' no está configurado — el hilo va a poder leerse, no responderse`,
            );
        }
        try {
            const resultado = await ingestarEventoMeta(integracion, evento);
            if (resultado === 'duplicado') duplicados += 1;
            else procesados += 1;
        } catch (err) {
            anotarError(`${contexto} ${evento.externoId}`, err);
        }
    };

    const entries = Array.isArray((payload as any)?.entry) ? (payload as any).entry : [];
    for (const entry of entries) {
        // Sólo se descarta cuando SABEMOS cuál es el id propio: las integraciones
        // de Lead Ads que ya están vivas no tienen pageId cargado (CANALES_META
        // no se lo exige a propósito), y tragarse sus leads por un id que nunca
        // pedimos sería mucho peor que el problema que esto evita.
        const entryId = texto(entry?.id);
        if (idEsperado && entryId && entryId !== idEsperado) {
            logger.warn(
                `[meta-webhook] integración ${integracion.id}: entry.id '${entryId}' no es la cuenta configurada `
                + `('${idEsperado}' para el objeto '${objeto}'): se descarta el entry entero`,
            );
            continue;
        }

        const ctx: ContextoNotificacion = {
            objeto,
            entryId,
            idsPropios,
            // `entry.time` NO tiene escala fija (ms en messaging[], segundos en
            // changes[]): lo resuelve fechaDeEntry por magnitud. Construirlo con
            // `new Date(Number(...))` fechaba en 1970 todo comentario de
            // Instagram —el único evento sin timestamp propio— y lo mandaba al
            // fondo de la bandeja, que ordena por ultimoMensajeAt.
            fechaEntry: fechaDeEntry(entry?.time),
        };

        // ── entry[].changes[] — leadgen y comentarios ────────────────────────
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
            const campo = texto(change?.field);
            const valor = change?.value;

            switch (campo) {
                case 'leadgen': {
                    // Camino ORIGINAL, intacto: formulario de campaña (Lead Ads).
                    // Permiso: leads_retrieval + pages_manage_ads sobre la página.
                    const leadgenId = valor?.leadgen_id;
                    if (!leadgenId) break;
                    try {
                        const lead = await obtenerLeadDeGraph(String(leadgenId), config.pageAccessToken ? descifrarSecreto(config.pageAccessToken) : '');
                        const origen: OrigenLead = config.origen ?? 'facebook';
                        await conContextoSistema(integracion.concesionariaId, () =>
                            ingestarConsulta({ origen, ...lead }));
                        procesados += 1;
                    } catch (err) {
                        anotarError(`leadgen ${leadgenId}`, err);
                    }
                    break;
                }

                case 'feed':
                    // Comentario en la página de Facebook. `feed` es un cajón de
                    // sastre (posts, reacciones, shares, ediciones): el filtro de
                    // item/verb vive en el normalizador.
                    if (objeto && objeto !== 'page') {
                        logger.warn(`[meta-webhook] integración ${integracion.id}: campo 'feed' con object '${objeto}' (se esperaba 'page')`);
                    }
                    await ingerir(normalizarComentarioFeed(valor, ctx), 'comentario de Facebook');
                    break;

                case 'comments':
                    // Comentario en una publicación de Instagram.
                    if (objeto && objeto !== 'instagram') {
                        logger.warn(`[meta-webhook] integración ${integracion.id}: campo 'comments' con object '${objeto}' (se esperaba 'instagram')`);
                    }
                    await ingerir(normalizarComentarioInstagram(valor, ctx), 'comentario de Instagram');
                    break;

                default:
                    // Campo suscripto que no atendemos (mentions, story_insights,
                    // ratings...). A debug y no a error: son ruido esperable, pero
                    // sin ESTA línea un campo mal suscripto es indistinguible de
                    // un bug nuestro.
                    logger.debug(`[meta-webhook] integración ${integracion.id}: campo '${campo}' ignorado (object '${objeto}')`);
            }
        }

        // ── entry[].messaging[] — DM de Messenger y de Instagram ─────────────
        // Array HERMANO de `changes`: los DM NO pasan por el bucle de arriba.
        const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
        for (const evento of messaging) {
            if (objeto !== 'page' && objeto !== 'instagram') {
                logger.warn(`[meta-webhook] integración ${integracion.id}: messaging[] con object '${objeto}' desconocido, se descarta`);
                break;
            }
            await ingerir(normalizarMensajeria(evento, ctx), objeto === 'instagram' ? 'DM de Instagram' : 'DM de Messenger');
        }
    }

    try {
        // Mismo motivo que la lectura: con app_rw la policy también aplica a los
        // UPDATE, así que sin el bypass esto afecta 0 filas en silencio.
        await withAuthBypass((tx) => tx.integracionCanal.update({
            where: { id: integracion.id },
            data: {
                ...(procesados > 0 ? { ultimoEvento: new Date() } : {}),
                // El error se LIMPIA sólo cuando este batch procesó algo bien.
                // Antes se pisaba a null en cualquier batch sin errores, aunque
                // no se hubiera procesado nada: el diagnóstico de Ajustes perdía
                // el último motivo real en cuanto entraba un evento ignorado.
                ...(ultimoErrorMsg !== null
                    ? { ultimoError: ultimoErrorMsg }
                    : procesados > 0 ? { ultimoError: null } : {}),
            },
        }));
    } catch (err) {
        logger.error(`[meta-webhook] integración ${integracion.id}: no se pudo actualizar el estado: ${mensajeCorto(err)}`);
    }

    if (procesados > 0 || duplicados > 0) {
        logger.info(
            `[meta-webhook] integración ${integracion.id} (object '${objeto}'): ` +
            `${procesados} evento(s) procesado(s), ${duplicados} duplicado(s) descartado(s)`,
        );
    }
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Pide el lead al Graph API y mapea field_data a los campos de la consulta.
 *
 * Va por `llamarGraph` y no por un fetch propio por DOS razones concretas:
 *   1. El token viaja en el header Authorization. En la query string terminaba
 *      en los access logs de cualquier intermediario y en cualquier tracing que
 *      capture URLs — o sea, el único momento en que el secreto sale del sistema
 *      era el único momento en que dejaba de estar protegido.
 *   2. `llamarGraph` LEE el body de error de Meta. Antes esto sólo miraba el
 *      status y guardaba "Graph API respondió 400" en `ultimoError`: el admin
 *      leía en Ajustes un número en vez de "falta el permiso leads_retrieval".
 */
async function obtenerLeadDeGraph(leadgenId: string, pageAccessToken: string): Promise<{
    nombre: string;
    telefono: string | null;
    email: string | null;
    texto: string | null;
}> {
    const data = await llamarGraph<{ field_data?: unknown }>(
        encodeURIComponent(leadgenId),
        { token: pageAccessToken, query: { fields: 'field_data' } },
    );
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
