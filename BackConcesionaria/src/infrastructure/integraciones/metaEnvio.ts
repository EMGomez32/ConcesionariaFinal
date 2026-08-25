import { CanalConversacion } from '@prisma/client';
import { BaseException } from '../../domain/exceptions/BaseException';
import {
    ConfigMeta,
    campoTokenParaCanal,
    estadoCanalesMeta,
    idDeCuentaMeta,
    motivoCanalMetaNoConfigurado,
} from '../../domain/services/canalesMeta';
import { withAuthBypass } from '../database/unitOfWork';
import { descifrarSecreto } from '../security/secretBox';
import { logger } from '../logging/logger';

/**
 * SALIDA hacia Meta: responder un DM (Send API) o un comentario (respuesta
 * PÚBLICA en el hilo del comentario). Es el espejo de metaCanales.ts, que es la
 * ENTRADA.
 *
 * Además de enviar, este módulo es el dueño de tres cosas que el resto consume:
 *   - qué es cada canal de Meta (DM vs comentario);
 *   - la VENTANA DE 24 H: cuándo está abierta y cómo se le explica al vendedor;
 *   - el cliente HTTP del Graph API y la traducción de sus errores.
 *
 * Vive en infraestructura y NO importa nada de application: conversacionService
 * y envioWorker importan de acá. Esa dirección única es lo que evita el ciclo, y
 * es la razón por la que la regla de la ventana está acá y no en la bandeja.
 *
 * QUIÉN LLAMA A `despacharMensajeMeta`: sólo el worker de la cola. El request
 * del panel NO envía — deja el mensaje `pendiente` con `encolarSaliente`, que ya
 * validó la ventana para que el vendedor vea el rechazo en pantalla y no en un
 * mensaje fallido que nadie mira.
 *
 * TENANT: el worker corre cross-tenant y SIN request, así que la integración se
 * lee con `withAuthBypass` filtrando el tenant A MANO. Con `rawPrisma` pelado la
 * RLS devolvería 0 filas EN SILENCIO y todo envío fallaría con "no hay
 * integración" sin que nada explique por qué.
 */

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

/** Timeout de cada llamada al Graph API. Meta responde en <1s cuando está sana. */
const TIMEOUT_MS = 10_000;

/** Meta sólo deja responder dentro de las 24 h del último mensaje del usuario. */
export const VENTANA_MENSAJERIA_MS = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Canales
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los canales CONVERSACIONALES de Meta. Se deriva del enum de Prisma en vez de
 * listarlos a mano: agregar un canal al schema lo suma acá solo, y el nombre no
 * choca con el `CanalMeta` del dominio (que además incluye 'leadgen', que no es
 * una conversación). Todo valor de este tipo es un `CanalMeta` válido.
 */
export type CanalMetaConversacion = Exclude<CanalConversacion, 'whatsapp'>;

/** Todo lo que no es WhatsApp sale por Meta, no por la cola de Baileys. */
export const esCanalMeta = (canal: CanalConversacion): canal is CanalMetaConversacion =>
    canal !== 'whatsapp';

/** Mensajería DIRECTA: son los ÚNICOS canales sujetos a la ventana de 24 h. */
export const esCanalDeMensajeria = (canal: CanalConversacion): boolean =>
    canal === 'instagram' || canal === 'messenger';

/** Comentarios: la respuesta se publica a la vista de todos. */
export const esCanalDeComentarios = (canal: CanalConversacion): boolean =>
    canal === 'instagram_comentario' || canal === 'facebook_comentario';

/** Nombre de la red para los textos que lee el vendedor. */
const redSocial = (canal: CanalConversacion): string =>
    canal === 'instagram' || canal === 'instagram_comentario' ? 'Instagram' : 'Messenger';

/** Objeto de webhook al que pertenece cada canal (para resolver ids y tokens). */
const objetoDe = (canal: CanalMetaConversacion): 'page' | 'instagram' =>
    canal === 'instagram' || canal === 'instagram_comentario' ? 'instagram' : 'page';

/**
 * El contrato del `config` vive en el dominio (`domain/services/canalesMeta`),
 * que es quien sabe qué necesita cada canal y qué falta cargar. Se re-exporta
 * para que metaCanales y metaWebhook lo tomen de un solo lugar.
 */
export type { ConfigMeta };

// ─────────────────────────────────────────────────────────────────────────────
// Errores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mapea el status de Meta al status HTTP con el que sale la respuesta al panel.
 * Un 401/403 de Meta (token vencido, permiso sin aprobar) NO es un 401 nuestro:
 * el usuario del panel está perfectamente autenticado; la que no tiene permiso
 * es la app contra Meta. Sale como 409 para que el front no cierre la sesión.
 */
const statusHaciaElCliente = (status: number): number =>
    status === 400 || status === 404 || status === 409 || status === 422 || status === 429
        ? status
        : status === 401 || status === 403
            ? 409
            : 502;

/**
 * Códigos de Meta que NO se arreglan reintentando.
 *
 *   10          → la acción no está permitida / permiso no concedido
 *                 (subcode 2534022 = mensaje fuera de la ventana de 24 h)
 *   100         → parámetro inválido (destinatario o id que no existe)
 *   190         → token vencido o revocado
 *   200         → falta un permiso (el clásico "requires X permission")
 *   230         → no se puede mensajear a ese usuario
 *   551         → destinatario no disponible
 *   803         → el objeto (post, comentario) ya no existe
 */
const CODIGOS_DEFINITIVOS = new Set([10, 100, 190, 200, 230, 551, 803]);

/** Fuera de la ventana de 24 h (Meta lo manda como subcódigo del code 10). */
const SUBCODIGO_FUERA_DE_VENTANA = 2534022;

/**
 * Qué lee el WORKER de un error de envío, sin conocer la jerarquía de
 * excepciones de cada transporte.
 *
 * Los tres campos existen porque tienen tres destinos distintos y no
 * intercambiables:
 *   - `mensajeVendedor` es lo ÚNICO que se guarda en `mensaje.errorMensaje`, o
 *     sea lo que se pinta dentro del chat. Va en criollo y termina siempre en
 *     qué hacer: un volcado del Graph API ahí adentro no le sirve a nadie que
 *     esté atendiendo a un cliente.
 *   - `detalleTecnico` es el texto de Meta SIN RESUMIR (code, subcode,
 *     error_user_msg, objeto crudo con el fbtrace_id). Va al log, que es donde
 *     se debuggea una integración a los seis meses.
 *   - `reintentable` decide si el worker reagenda o marca fallido en el acto.
 *
 * Un error que NO implemente esto (los de Baileys, que son de una librería
 * ajena) se trata como reintentable y el worker le pone un texto genérico: es
 * el comportamiento de siempre de WhatsApp.
 */
export interface ErrorDeEnvio {
    readonly mensajeVendedor: string;
    readonly detalleTecnico: string;
    readonly reintentable: boolean;
}

/**
 * Traduce el rechazo de Meta a una frase para el vendedor.
 *
 * Meta contesta en inglés y con códigos, y el estado más probable en la
 * práctica —App Review todavía sin aprobar— produce el peor texto posible
 * ("(#200) Requires pages_manage_engagement permission..."). El código ya está
 * parseado y clasificado acá arriba: convertirlo en una frase es lo que separa
 * "no salió y no sé por qué" de "no salió, avisale al administrador".
 *
 * Nunca incluye el código: eso vive en `detalleTecnico`, que va al log.
 */
function mensajeVendedorDeMeta(status: number, codigo: number | null, subcodigo: number | null): string {
    const avisarAlAdmin = 'Avisale a un administrador: se revisa en Ajustes › Integraciones.';

    if (subcodigo === SUBCODIGO_FUERA_DE_VENTANA) {
        return 'Meta no aceptó el mensaje porque pasaron más de 24 horas desde el último mensaje de la persona. '
            + 'Vas a poder escribirle en cuanto vuelva a escribir.';
    }
    switch (codigo) {
        case 200:
        case 10:
            return 'Meta todavía no le aprobó a la app el permiso para responder por este canal, así que la respuesta NO se publicó. '
                + `No se arregla reintentando. ${avisarAlAdmin}`;
        case 190:
            return `El acceso a Meta venció y hay que volver a generar el token de la página. ${avisarAlAdmin}`;
        case 803:
        case 100:
            return 'Meta no encontró a dónde mandar la respuesta: lo más probable es que el comentario o la publicación se hayan borrado.';
        case 230:
        case 551:
            return 'Meta no deja escribirle a esta persona (puede haber bloqueado los mensajes de la cuenta). Si es urgente, contactala por otra vía.';
        default:
            break;
    }
    if (status === 0) return 'No se pudo contactar a Meta (problema de conexión). Se reintenta solo en unos segundos.';
    if (status === 429) return 'Meta está limitando los envíos de la cuenta en este momento. Se reintenta solo en unos minutos.';
    if (status >= 500) return 'Meta tuvo un problema de su lado y no aceptó el envío. Se reintenta solo en unos minutos.';
    return `Meta rechazó el envío y la respuesta no salió. ${avisarAlAdmin}`;
}

/**
 * Rechazo del Graph API.
 *
 * `message` (= `detalleTecnico`) es el texto de Meta ARMADO SIN RESUMIR:
 * código, subcódigo, `error.message`, el `error_user_msg` que Meta escribe para
 * mostrar, y el objeto `error` crudo. Ahí es donde Meta dice QUÉ permiso falta o
 * por qué rebotó, y es lo único que sirve para debuggear una integración a los
 * seis meses: por eso va al LOG entero, y al chat va `mensajeVendedor`.
 */
export class MetaError extends BaseException implements ErrorDeEnvio {
    constructor(
        message: string,
        readonly status: number,
        readonly codigo: number | null = null,
        readonly subcodigo: number | null = null,
        /** Fuerza la clasificación; por defecto se deduce del código/status. */
        private readonly definitivo?: boolean,
    ) {
        super(statusHaciaElCliente(status), message, 'META_ERROR');
        this.name = 'MetaError';
    }

    /**
     * Reintentar NO lo va a arreglar: permiso sin aprobar, token vencido,
     * ventana cerrada, destinatario inalcanzable, objeto borrado. El worker lo
     * mira para marcar 'fallido' en el primer intento en vez de quemar tres
     * durante doce minutos y dejar al vendedor mirando un "enviando" que nunca
     * va a salir.
     *
     * Un timeout, un 429 o un 5xx NO son definitivos: ésos sí se reintentan.
     */
    get esDefinitivo(): boolean {
        if (this.definitivo !== undefined) return this.definitivo;
        if (this.codigo !== null && CODIGOS_DEFINITIVOS.has(this.codigo)) return true;
        return this.status === 400 || this.status === 403 || this.status === 404;
    }

    get reintentable(): boolean {
        return !this.esDefinitivo;
    }

    get detalleTecnico(): string {
        return this.message;
    }

    get mensajeVendedor(): string {
        return mensajeVendedorDeMeta(this.status, this.codigo, this.subcodigo);
    }
}

/**
 * La ventana de 24 h está cerrada. Error de DOMINIO: se tira ANTES de llamar a
 * la API, así que no gasta una llamada ni deja rastro en Meta. El texto va en
 * criollo porque lo lee un vendedor, no un desarrollador: nunca un código.
 *
 * `reintentable = false` NO es decorativo: una ventana cerrada no se reabre
 * sola, así que sin esta marca el worker reagendaba tres veces y el vendedor
 * miraba "pendiente" más de un minuto para un fallido que ya era seguro.
 */
export class VentanaMetaCerradaError extends BaseException implements ErrorDeEnvio {
    readonly reintentable = false;

    constructor(message: string) {
        super(409, message, 'VENTANA_META_CERRADA');
        this.name = 'VentanaMetaCerradaError';
    }

    /** Ya está escrito en criollo: el mismo texto sirve para el chat y para el log. */
    get mensajeVendedor(): string {
        return this.message;
    }

    get detalleTecnico(): string {
        return this.message;
    }
}

/**
 * Falta configurar algo del canal (token, id de página, destino). También de
 * dominio, y también definitivo: el token no aparece solo entre un reintento y
 * el siguiente.
 */
export class CanalMetaNoConfiguradoError extends BaseException implements ErrorDeEnvio {
    readonly reintentable = false;

    constructor(message: string) {
        super(409, message, 'META_CANAL_NO_CONFIGURADO');
        this.name = 'CanalMetaNoConfiguradoError';
    }

    get mensajeVendedor(): string {
        return this.message;
    }

    get detalleTecnico(): string {
        return this.message;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cliente del Graph API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Arma el detalle TEXTUAL del error de Meta. NO resume: concatena todo lo que
 * vino, incluido el objeto `error` crudo — si Meta agrega mañana un campo que
 * explica el rechazo, no lo perdemos por no haberlo previsto acá.
 */
function detalleDeError(json: Record<string, unknown>, status: number, statusText: string): {
    detalle: string;
    codigo: number | null;
    subcodigo: number | null;
} {
    const error = (json?.error ?? {}) as Record<string, unknown>;
    const codigo = typeof error.code === 'number' ? error.code : null;
    const subcodigo = typeof error.error_subcode === 'number' ? error.error_subcode : null;

    const cabecera = `Meta rechazó la llamada (HTTP ${status}`
        + (codigo !== null ? `, code ${codigo}` : '')
        + (subcodigo !== null ? `/${subcodigo}` : '')
        + '): ';
    const cuerpo = String(error.message ?? statusText ?? 'sin detalle');
    // error_user_title/msg es el texto que Meta escribe PARA MOSTRARLE al
    // usuario final: cuando viene, suele ser más claro que `message`.
    const paraUsuario = [error.error_user_title, error.error_user_msg].filter(Boolean).join(': ');
    const crudo = Object.keys(error).length ? ` · crudo: ${JSON.stringify(error)}` : '';

    return {
        detalle: cabecera + cuerpo + (paraUsuario ? ` — ${paraUsuario}` : '') + crudo,
        codigo,
        subcodigo,
    };
}

/**
 * Llama al Graph API y devuelve el JSON.
 *
 * A diferencia de `obtenerLeadDeGraph` (que sólo mira el status), acá SÍ se lee
 * el body de error: los códigos de la ventana de 24 h y los de permiso sin
 * aprobar viven ahí, y son justamente lo que hay que mostrarle al vendedor y
 * guardar en el mensaje.
 *
 * El token va en el header Authorization y no en la query string: un token en la
 * URL termina en los logs de acceso y en cualquier proxy del camino.
 */
export async function llamarGraph<T>(
    ruta: string,
    init: {
        token: string;
        method?: string;
        body?: unknown;
        query?: Record<string, string | undefined>;
        timeoutMs?: number;
    },
): Promise<T> {
    if (!init.token) {
        throw new CanalMetaNoConfiguradoError(
            'La integración de Meta no tiene cargado el token de acceso. '
            + 'Avisale a un administrador para que lo cargue en Ajustes › Integraciones.',
        );
    }

    const url = new URL(ruta.startsWith('http') ? ruta : `${GRAPH_API_BASE}/${ruta.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(init.query ?? {})) {
        if (v !== undefined) url.searchParams.set(k, v);
    }

    let res: Response;
    try {
        res = await fetch(url.toString(), {
            method: init.method ?? 'GET',
            headers: {
                Authorization: `Bearer ${init.token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
            signal: AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS),
        });
    } catch (err) {
        // Timeout o red caída: NO es definitivo, así que el worker lo reintenta
        // con backoff en vez de descartar el mensaje que escribió el vendedor.
        const motivo = err instanceof Error ? err.message : String(err);
        throw new MetaError(`No se pudo contactar al Graph API de Meta: ${motivo}`, 0, null, null, false);
    }

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
        const { detalle, codigo, subcodigo } = detalleDeError(json, res.status, res.statusText);
        throw new MetaError(detalle, res.status, codigo, subcodigo);
    }
    return json as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// La ventana de 24 h
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo MÍNIMO para resolver la ventana de 24 h. Separado de la fila completa a
 * propósito: la bandeja pregunta por la ventana con dos campos sueltos (no tiene
 * el hilo entero a mano) y no por eso tiene que reimplementar la regla.
 */
export interface HiloConVentanaMeta {
    canal: CanalConversacion;
    ventanaVenceAt: Date | null;
    /** Para nombrar a la persona en el motivo; 'esta persona' si no se sabe. */
    nombreContacto?: string | null;
}

/**
 * Lo que el envío y el composer necesitan del hilo. Es estructural a propósito:
 * le sirve tanto la fila completa que trae el worker como el `select` acotado
 * de `detalle`.
 */
export interface ConversacionMetaEnvio extends HiloConVentanaMeta {
    id: number;
    concesionariaId: number;
    integracionId: number | null;
    /** PSID (Messenger) o IGSID (Instagram): a quién se le manda el DM. */
    contactoExternoId: string | null;
    /** Comentario RAÍZ del hilo: de dónde se cuelga la respuesta pública. */
    comentarioExternoId: string | null;
    nombreContacto: string | null;
}

/** Estado de la ventana de mensajería, listo para pintar en el composer. */
export interface EstadoVentanaMeta {
    /** false = el composer se deshabilita y se muestra `motivo` tal cual. */
    puedeResponder: boolean;
    /** Por qué NO se puede escribir, en criollo. null cuando se puede. */
    motivo: string | null;
    /** Cuándo se cierra la ventana (para el contador de la UI). */
    venceAt: Date | null;
}

const nombreDe = (c: HiloConVentanaMeta): string => c.nombreContacto?.trim() || 'esta persona';

/**
 * ¿Se puede responder ahora mismo? Sin efectos: la bandeja la usa para mandarle
 * al front el estado del composer JUNTO con el hilo, así el vendedor ve la caja
 * deshabilitada y el motivo ANTES de escribir un párrafo entero — que es
 * exactamente el problema que esto existe para evitar.
 *
 * Es la ÚNICA implementación de la regla y del texto que la explica: la usan el
 * detalle del hilo y el encolado (vía `conversacionService.estadoVentana`, que
 * sólo adapta la forma) y el despacho real, justo antes de tocar la API. Por eso
 * el vendedor lee SIEMPRE la misma frase, venga el rechazo del composer, del 409
 * o de la burbuja fallida.
 *
 * `ventanaVenceAt` en null en un canal de DM se trata como CERRADA a propósito:
 * es la única lectura segura (nunca vimos un mensaje entrante de esa persona, o
 * la ingesta no lo registró) y equivocarse hacia "abierta" significa mandar a
 * Meta un envío que va a rebotar.
 */
export function estadoVentanaMeta(conversacion: HiloConVentanaMeta): EstadoVentanaMeta {
    const { canal, ventanaVenceAt } = conversacion;

    // WhatsApp y los comentarios no pasan por la ventana de mensajería. Un
    // comentario se responde en público y no caduca; lo que sí caduca (7 días)
    // son las "respuestas privadas" por DM a un comentario, que no hacemos.
    if (!esCanalDeMensajeria(canal)) {
        return { puedeResponder: true, motivo: null, venceAt: null };
    }

    const red = redSocial(canal);

    if (!ventanaVenceAt) {
        return {
            puedeResponder: false,
            venceAt: null,
            motivo: `Todavía no hay un mensaje de ${nombreDe(conversacion)} en las últimas 24 horas, `
                + `y ${red} no deja escribirle fuera de ese plazo. Vas a poder responder en cuanto escriba.`,
        };
    }

    if (ventanaVenceAt.getTime() <= Date.now()) {
        const horas = Math.max(0, Math.floor((Date.now() - ventanaVenceAt.getTime()) / 3_600_000));
        return {
            puedeResponder: false,
            venceAt: ventanaVenceAt,
            motivo: `Pasaron más de 24 horas desde el último mensaje de ${nombreDe(conversacion)} `
                + `(hace ${24 + horas} h) y ${red} no deja responder fuera de ese plazo. `
                + 'Vas a poder escribirle en cuanto vuelva a escribir; si es urgente, contactala por otra vía.',
        };
    }

    return { puedeResponder: true, motivo: null, venceAt: ventanaVenceAt };
}

/**
 * Corta el envío ANTES de llamar a la API. Nunca un 500: la ventana cerrada es
 * una regla de negocio de Meta, no una falla del sistema.
 *
 * Se llama DOS veces a propósito:
 *  1. al encolar (request del panel) → el vendedor ve el rechazo al instante y
 *     no se le pierde el texto en un mensaje "fallido" que nadie mira;
 *  2. al despachar (worker) → la ventana pudo vencer mientras el mensaje
 *     esperaba en la cola, y ahí ya no hay a quién avisarle en vivo.
 */
export function assertVentanaMetaAbierta(conversacion: HiloConVentanaMeta): void {
    const ventana = estadoVentanaMeta(conversacion);
    if (ventana.puedeResponder) return;
    throw new VentanaMetaCerradaError(ventana.motivo ?? 'La ventana de mensajería de Meta está cerrada');
}

// ─────────────────────────────────────────────────────────────────────────────
// Credenciales del canal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Integración + token descifrado, listo para usar.
 *
 * Cross-tenant deliberado (el worker no tiene contexto), pero con el tenant
 * filtrado A MANO en el where: aunque el `integracionId` de la conversación
 * viniera pisado, nunca se puede terminar mandando un mensaje con el token de
 * OTRA concesionaria.
 */
async function credencialesDe(
    conversacion: ConversacionMetaEnvio,
    canal: CanalMetaConversacion,
): Promise<{ config: ConfigMeta; token: string }> {
    if (!conversacion.integracionId) {
        throw new CanalMetaNoConfiguradoError(
            'La conversación no está vinculada a ninguna integración de Meta, así que no hay por dónde responder.',
        );
    }

    const integracion = await withAuthBypass((tx) => tx.integracionCanal.findFirst({
        where: {
            id: conversacion.integracionId as number,
            concesionariaId: conversacion.concesionariaId,
            tipo: 'meta',
            activo: true,
            deletedAt: null,
        },
    }));
    if (!integracion) {
        throw new CanalMetaNoConfiguradoError(
            'La integración de Meta de esta conversación está desactivada o fue eliminada. '
            + 'Avisale a un administrador para que la revise en Ajustes › Integraciones.',
        );
    }

    const config = (integracion.config ?? {}) as ConfigMeta;

    // Qué falta lo decide el dominio, que es el mismo que pinta el estado de los
    // canales en Ajustes: así el error que lee el vendedor y el cartel que ve el
    // admin dicen EXACTAMENTE lo mismo, y el mensaje nombra el campo que falta
    // en vez de un 400 críptico de Meta tres minutos después.
    const estado = estadoCanalesMeta(config).find((c) => c.canal === canal);
    if (estado && !estado.habilitado) {
        throw new CanalMetaNoConfiguradoError(motivoCanalMetaNoConfigurado(estado));
    }

    // El dominio devuelve el NOMBRE del campo, no el valor: lo guardado está
    // cifrado y descifrar es cosa de infraestructura.
    const campo = campoTokenParaCanal(config, canal);
    const crudo = campo ? config[campo] : '';

    return { config, token: crudo ? descifrarSecreto(crudo) : '' };
}

/**
 * Id del emisor para el POST /{id}/messages: la página (Messenger) o la cuenta
 * de Instagram (DM de IG). Se cae a `me` —que con un token de página resuelve a
 * la página sola— sólo si el admin todavía no cargó el id; se prefiere el
 * explícito porque con un token de usuario `me` apunta al usuario y Meta
 * rechaza con un error que no dice nada útil.
 */
const emisorDeDm = (canal: CanalMetaConversacion, config: ConfigMeta): string =>
    idDeCuentaMeta(config, objetoDe(canal)) ?? idDeCuentaMeta(config, 'page') ?? 'me';

// ─────────────────────────────────────────────────────────────────────────────
// Envío
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Despacha un saliente por el canal de Meta que corresponda y devuelve el id que
 * asignó Meta.
 *
 * Ese id importa más allá del registro: el worker lo guarda en
 * `mensaje.externoId`, que es la MISMA clave con la que la ingesta descarta lo
 * ya visto. Sin guardarlo, la respuesta del vendedor podría volver a entrar por
 * el webhook y aparecer dos veces en el chat.
 *
 * NO captura errores: el worker distingue `MetaError.esDefinitivo` (marcar
 * fallido guardando el texto de Meta) de un fallo de red (reintentar).
 */
export async function despacharMensajeMeta(
    conversacion: ConversacionMetaEnvio,
    contenido: string,
): Promise<{ externoId: string | null }> {
    const canal = conversacion.canal;
    if (!esCanalMeta(canal)) {
        throw new CanalMetaNoConfiguradoError('Un hilo de WhatsApp no se despacha por la API de Meta');
    }

    // La ventana ANTES de tocar la API. El encolado ya la chequeó, pero un
    // mensaje puede pasar minutos en la cola (backoff) y cruzar el límite justo
    // acá; llamar igual sería regalarle a Meta un rechazo evitable.
    assertVentanaMetaAbierta(conversacion);

    const texto = (contenido ?? '').trim();
    if (!texto) throw new CanalMetaNoConfiguradoError('El mensaje no puede estar vacío');

    const { config, token } = await credencialesDe(conversacion, canal);

    return esCanalDeComentarios(canal)
        ? responderComentario(conversacion, canal, texto, token)
        : enviarDm(conversacion, canal, config, texto, token);
}

/**
 * DM de Instagram y de Messenger — Send API.
 *
 * PERMISOS DE META que exige este camino, y qué pasa si NO están aprobados:
 *   - Messenger: `pages_messaging` (+ la página suscripta a la app). Sin App
 *     Review, Meta responde 403 code 200 y el envío falla SIEMPRE; en modo
 *     desarrollo sólo se puede mensajear a gente con rol en la app
 *     (admin/dev/tester), a cualquier otro rebota igual.
 *   - Instagram: `instagram_business_basic` + `instagram_business_manage_messages`
 *     (flujo Instagram Login) o `instagram_manage_messages` (Facebook Login for
 *     Business). Sin aprobación sólo funciona contra hasta 25 usuarios de
 *     prueba; con una cuenta real Meta devuelve 400/403, el mensaje queda
 *     fallido con la frase en criollo en `errorMensaje` ("Meta todavía no le
 *     aprobó a la app el permiso…") y el detalle crudo de Meta, en el log.
 *   - Además la cuenta de Instagram tiene que ser PROFESIONAL, estar vinculada a
 *     la página de Facebook y tener habilitado el acceso a mensajes de
 *     herramientas conectadas en la app de Instagram (Configuración › Privacidad
 *     › Mensajes). Con eso apagado, Meta rechaza con code 10.
 *
 * `messaging_type: 'RESPONSE'` declara que esto es una respuesta DENTRO de la
 * ventana de 24 h. Es el único tipo que no exige etiqueta; mandar fuera de la
 * ventana requeriría un MESSAGE_TAG con motivo aprobado, que a propósito no se
 * usa acá — por eso la ventana se verifica antes y no se manda nunca.
 */
async function enviarDm(
    conversacion: ConversacionMetaEnvio,
    canal: CanalMetaConversacion,
    config: ConfigMeta,
    texto: string,
    token: string,
): Promise<{ externoId: string | null }> {
    if (!conversacion.contactoExternoId) {
        throw new CanalMetaNoConfiguradoError(
            'La conversación no tiene guardado el id del contacto en Meta, así que no hay a quién mandarle el mensaje.',
        );
    }

    const respuesta = await llamarGraph<{ message_id?: string; recipient_id?: string }>(
        `${encodeURIComponent(emisorDeDm(canal, config))}/messages`,
        {
            token,
            method: 'POST',
            body: {
                recipient: { id: conversacion.contactoExternoId },
                message: { text: texto },
                messaging_type: 'RESPONSE',
            },
        },
    );

    logger.info(`[meta-envio] hilo ${conversacion.id} (${conversacion.canal}): DM enviado (${respuesta.message_id ?? 's/id'})`);
    return { externoId: respuesta.message_id ?? null };
}

/**
 * Respuesta a un comentario — se cuelga del comentario RAÍZ del hilo.
 *
 * OJO: esto es PÚBLICO. Lo ve cualquiera que entre a la publicación, no sólo
 * quien comentó. El composer del front tiene que decirlo ANTES de escribir.
 *
 * PERMISOS DE META que exige este camino, y qué pasa si NO están aprobados:
 *   - Facebook (POST /{comment-id}/comments): `pages_manage_engagement` para
 *     publicar la respuesta, más `pages_read_user_content` para haber podido
 *     leer el comentario original. Sin `pages_manage_engagement`, Meta responde
 *     403 code 200 ("requires pages_manage_engagement permission") y no se
 *     publica nada.
 *   - Instagram (POST /{ig-comment-id}/replies): `instagram_manage_comments` (o
 *     `instagram_business_manage_comments` en el flujo Instagram Login). Sin App
 *     Review sólo anda con las cuentas de prueba de la app.
 *
 * NO hay ventana de 24 h acá: un comentario público se responde cuando sea.
 */
async function responderComentario(
    conversacion: ConversacionMetaEnvio,
    canal: CanalMetaConversacion,
    texto: string,
    token: string,
): Promise<{ externoId: string | null }> {
    if (!conversacion.comentarioExternoId) {
        throw new CanalMetaNoConfiguradoError(
            'La conversación no tiene guardado el id del comentario, así que no se sabe en qué hilo publicar la respuesta.',
        );
    }

    // Instagram usa /replies y Facebook /comments para lo mismo: colgar una
    // respuesta del comentario raíz. Las dos redes aplanan los hilos en dos
    // niveles, así que responder al raíz también es lo correcto para contestarle
    // a alguien que escribió dentro del hilo.
    const sufijo = canal === 'instagram_comentario' ? 'replies' : 'comments';

    const respuesta = await llamarGraph<{ id?: string }>(
        `${encodeURIComponent(conversacion.comentarioExternoId)}/${sufijo}`,
        { token, method: 'POST', body: { message: texto } },
    );

    logger.info(`[meta-envio] hilo ${conversacion.id} (${conversacion.canal}): comentario respondido (${respuesta.id ?? 's/id'})`);
    return { externoId: respuesta.id ?? null };
}
