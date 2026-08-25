import { CanalConversacion } from '@prisma/client';
import { BaseException } from '../exceptions/BaseException';
import {
    VENTANA_MENSAJERIA_MS,
    esCanalDeMensajeria,
    motivoCanalMetaNoConfigurado,
    type CanalMetaConversacion,
} from './canalesMeta';

/**
 * Contrato de los ERRORES DE ENVÍO de Meta y la regla de la VENTANA DE 24 H.
 *
 * Vive en el dominio y no al lado del cliente HTTP porque es PURO —no hace red ni
 * toca la base— y porque así se testea sin levantar nada:
 * `infrastructure/integraciones/metaEnvio` importa `unitOfWork` -> `prisma` ->
 * `env`, y `env` valida y hace `process.exit(1)` en el import. Un unit test que
 * importara estas clases desde allá se moría por falta de JWT_SECRET, que es
 * exactamente lo que pasó en CI: el job de unit tests define sólo un DATABASE_URL
 * dummy, a propósito, porque los unit tests de este repo son puros.
 */

/** Nombre de la red para los textos que lee el vendedor. */
const redSocial = (canal: CanalConversacion): string =>
    canal === 'instagram' || canal === 'instagram_comentario' ? 'Instagram' : 'Facebook';

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
            return 'Meta no deja escribirle a esta persona (puede haber bloqueado los mensajes de la cuenta). Si es urgente, buscá otra vía para llegarle.';
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
                + 'Vas a poder escribirle en cuanto te vuelva a escribir; si es urgente, buscá otra vía para llegarle.',
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
