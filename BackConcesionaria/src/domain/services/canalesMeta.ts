/**
 * Qué puede hacer una integración de Meta con lo que tiene cargado.
 *
 * Una concesionaria conecta UNA app de Meta, pero cada canal (formulario de
 * campaña, DM de Messenger, DM de Instagram, comentarios de la página,
 * comentarios de Instagram) necesita datos distintos en el `config` y permisos
 * distintos otorgados DEL OTRO LADO, en el portal de Meta. Este módulo responde
 * una sola pregunta, sin tocar red ni base: con lo que hay guardado, ¿qué
 * canales podemos atender de verdad?
 *
 * Es puro a propósito: lo usa el controller para que la pantalla de Ajustes
 * diga la verdad (y no prometa DMs de Instagram cuando falta el id de la
 * cuenta), y lo puede usar el webhook para descartar temprano un evento de un
 * canal que esta integración no tiene configurado.
 *
 * Lo que este módulo NO puede saber: si el admin realmente suscribió el campo
 * en Webhooks y si Meta le aprobó el permiso — eso vive en el portal de Meta y
 * no hay forma barata de consultarlo. Por eso cada canal publica también
 * `enMeta`: el paso que falta hacer del otro lado, que la pantalla muestra tal
 * cual en vez de inventar un "activo" que puede ser mentira.
 */

/** Objeto de webhook de Meta al que llega el evento (payload.object). */
export type ObjetoWebhookMeta = 'page' | 'instagram';

/**
 * Canales que puede traer/atender una integración meta. Los cuatro
 * conversacionales se llaman IGUAL que los valores del enum CanalConversacion
 * (instagram, messenger, instagram_comentario, facebook_comentario) para que el
 * webhook y la bandeja no necesiten una tabla de traducción; `leadgen` no es un
 * canal de conversación (termina en una consulta/cliente, no en un hilo).
 */
export type CanalMeta =
    | 'leadgen'
    | 'messenger'
    | 'instagram'
    | 'facebook_comentario'
    | 'instagram_comentario';

/**
 * Forma del config Json de una integración tipo 'meta'. Fuente de verdad del
 * contrato (el schema Zod de interface/validation/integracion.schema.ts valida
 * exactamente esto). Los campos marcados SECRETO se guardan cifrados en reposo
 * (secretBox.CAMPOS_SECRETOS) y salen enmascarados por la API: acá siempre hay
 * que mirar si ESTÁN, nunca cuánto valen.
 */
export interface ConfigMeta {
    /**
     * Origen que se le pone al lead de Lead Ads (espejo de OrigenLead). NO
     * limita los canales: una misma integración puede recibir eventos del
     * objeto `page` y del `instagram` a la vez, porque en el portal de Meta la
     * URL de callback se pega por objeto y las dos apuntan a este mismo
     * webhook.
     */
    origen?: 'instagram' | 'facebook';
    /** Token que inventa el admin y repite en Meta; valida el handshake GET. */
    verifyToken?: string;
    /** SECRETO. App secret de la app de Meta; firma (HMAC) cada POST entrante. */
    appSecret?: string;
    /**
     * SECRETO. Token de acceso de la PÁGINA de Facebook.
     * Habilita: leer el lead de Lead Ads, la Send API de Messenger
     * (pages_messaging) y responder/leer comentarios de la página
     * (pages_read_user_content + pages_manage_engagement). Si la app usa
     * "Facebook Login for Business", también sirve para los DM y comentarios de
     * Instagram (instagram_manage_messages / instagram_manage_comments).
     * En Meta: app → Herramientas → Explorador de la API Graph (o Configuración
     * → Webhooks → Generar token) eligiendo la página; conviene un token de
     * larga duración, el de sesión vence en ~1 hora.
     */
    pageAccessToken?: string;
    /**
     * Id numérico de la página de Facebook (público, NO es secreto).
     * Habilita los canales del objeto `page`: sin él no podemos verificar que
     * el evento entrante sea de NUESTRA página (entry.id) ni distinguir un
     * mensaje del cliente de uno nuestro (sender.id === pageId ⇒ lo mandamos
     * nosotros), y un webhook mal pegado entraría mudo.
     * En Meta: Página → Configuración → Información de la página → "Id. de la
     * página"; o en el Explorador de la API Graph, GET /me?fields=id con el
     * token de la página.
     */
    pageId?: string;
    /**
     * Id de la cuenta profesional de Instagram (IGID, público, NO es secreto).
     * Habilita los canales del objeto `instagram` (DM y comentarios): es el
     * entry.id de esos eventos y el destinatario de la Send API de Instagram.
     * En Meta: la cuenta de Instagram tiene que ser Profesional y estar
     * vinculada a la página; el id sale de GET /{page-id}?fields=
     * instagram_business_account (o connected_instagram_account) en el
     * Explorador de la API Graph, y en la app de Instagram hay que dejar
     * activado Configuración → Mensajes → "Permitir el acceso a los mensajes".
     */
    igBusinessAccountId?: string;
    /**
     * SECRETO y OPCIONAL. Token de usuario de Instagram, sólo si la app se
     * conectó con el flujo "Instagram Login" (permisos instagram_business_basic
     * + instagram_business_manage_messages + instagram_business_manage_comments),
     * que emite un token propio de la cuenta de IG en vez de reusar el de la
     * página. Con "Facebook Login for Business" NO hace falta: dejalo vacío y
     * se usa el token de la página.
     * En Meta: app → Instagram → Configuración de la API con Instagram Login →
     * Generar token de acceso.
     */
    instagramAccessToken?: string;
}

/** Estado de un canal para esta integración, tal como lo consume la pantalla. */
export interface EstadoCanalMeta {
    canal: CanalMeta;
    /** Nombre en criollo, para mostrar. */
    etiqueta: string;
    /** Objeto y campo de webhook que hay que tener suscripto en Meta. */
    objeto: ObjetoWebhookMeta;
    campo: string;
    /** true = de nuestro lado no falta nada para atender ese canal. */
    habilitado: boolean;
    /** Qué falta cargar ACÁ (null si está completo). */
    falta: string | null;
    /** Qué hay que hacer ALLÁ, en el portal de Meta (no lo podemos verificar). */
    enMeta: string;
}

interface DefinicionCanal extends Omit<EstadoCanalMeta, 'habilitado' | 'falta'> {
    /** Qué falta en el config para atender el canal; null = listo. */
    falta: (config: ConfigMeta) => string | null;
}

const cargado = (valor: unknown): boolean => typeof valor === 'string' && valor.trim().length > 0;

const FALTA_TOKEN_PAGINA = 'Falta el token de página';
const FALTA_PAGE_ID = 'Falta el id de la página de Facebook';
const FALTA_IG_ID = 'Falta el id de la cuenta de Instagram';
const FALTA_TOKEN_IG = 'Falta el token de Instagram (o el token de página, si la app usa Facebook Login)';

/** Lo que hace falta para los canales del objeto `page` (Messenger y comentarios). */
const faltaPagina = (c: ConfigMeta): string | null => {
    if (!cargado(c.pageAccessToken)) return FALTA_TOKEN_PAGINA;
    if (!cargado(c.pageId)) return FALTA_PAGE_ID;
    return null;
};

/** Lo que hace falta para los canales del objeto `instagram` (DM y comentarios). */
const faltaInstagram = (c: ConfigMeta): string | null => {
    if (!cargado(c.igBusinessAccountId)) return FALTA_IG_ID;
    if (!cargado(c.instagramAccessToken) && !cargado(c.pageAccessToken)) return FALTA_TOKEN_IG;
    return null;
};

export const CANALES_META: readonly DefinicionCanal[] = [
    {
        canal: 'leadgen',
        etiqueta: 'Formulario de campaña (Lead Ads)',
        objeto: 'page',
        campo: 'leadgen',
        // A propósito NO exige pageId: es el único canal que ya está vivo en
        // producción y las integraciones existentes no tienen ese campo. Pedirlo
        // acá las mostraría "apagadas" de un día para el otro siendo mentira.
        falta: (c) => (cargado(c.pageAccessToken) ? null : FALTA_TOKEN_PAGINA),
        enMeta: 'Webhooks → objeto "Page" → suscribí el campo "leadgen" con esta URL y el verify token. Permisos: leads_retrieval y pages_manage_metadata.',
    },
    {
        canal: 'messenger',
        etiqueta: 'Mensajes de Messenger',
        objeto: 'page',
        campo: 'messages',
        falta: faltaPagina,
        enMeta: 'Webhooks → objeto "Page" → campo "messages". Permiso pages_messaging (más pages_manage_metadata para suscribir). Mientras la app esté en modo desarrollo sólo podés escribirle a gente con rol en la app.',
    },
    {
        canal: 'facebook_comentario',
        etiqueta: 'Comentarios en la página de Facebook',
        objeto: 'page',
        // Los comentarios NO tienen campo propio: llegan como cambios de "feed"
        // con value.item === 'comment'.
        campo: 'feed',
        falta: faltaPagina,
        enMeta: 'Webhooks → objeto "Page" → campo "feed" (los comentarios llegan ahí). Permisos: pages_manage_metadata para suscribir, pages_read_user_content para leer lo que escribe la gente y pages_manage_engagement para responder o moderar.',
    },
    {
        canal: 'instagram',
        etiqueta: 'Mensajes directos de Instagram',
        objeto: 'instagram',
        campo: 'messages',
        falta: faltaInstagram,
        enMeta: 'Webhooks → objeto "Instagram" → campo "messages". Permisos instagram_business_basic + instagram_business_manage_messages (flujo Instagram Login) o instagram_manage_messages (Facebook Login for Business). La cuenta tiene que ser Profesional, vinculada a la página, y con el acceso a mensajes activado en la app de Instagram. Para escribirle a usuarios reales hace falta App Review; sin review se prueba con hasta 25 cuentas de prueba.',
    },
    {
        canal: 'instagram_comentario',
        etiqueta: 'Comentarios en Instagram',
        objeto: 'instagram',
        campo: 'comments',
        falta: faltaInstagram,
        enMeta: 'Webhooks → objeto "Instagram" → campo "comments". Permiso instagram_manage_comments (Facebook Login for Business) o instagram_business_manage_comments (flujo Instagram Login).',
    },
] as const;

const comoConfig = (config: unknown): ConfigMeta => (config ?? {}) as ConfigMeta;

/**
 * Estado de los cinco canales para una integración meta. Se calcula sobre el
 * config GUARDADO (los secretos pueden venir cifrados o enmascarados: acá sólo
 * se mira si están presentes, nunca su valor).
 */
export function estadoCanalesMeta(config: unknown): EstadoCanalMeta[] {
    const c = comoConfig(config);
    return CANALES_META.map((def) => {
        const falta = def.falta(c);
        return {
            canal: def.canal,
            etiqueta: def.etiqueta,
            objeto: def.objeto,
            campo: def.campo,
            habilitado: falta === null,
            falta,
            enMeta: def.enMeta,
        };
    });
}

/** Atajo para el webhook/envío: ¿esta integración tiene con qué atender el canal? */
export function canalMetaHabilitado(config: unknown, canal: CanalMeta): boolean {
    const def = CANALES_META.find((d) => d.canal === canal);
    if (!def) return false;
    return def.falta(comoConfig(config)) === null;
}

/**
 * Motivo en criollo de que un canal no se pueda usar para responder, con el
 * campo que falta nombrado.
 *
 * Vive acá y no en cada capa porque lo leen los DOS extremos del mismo rechazo:
 * el 409 del encolado (el vendedor lo ve en el composer, al instante) y el
 * error del worker (el vendedor lo ve en la burbuja fallida). Un solo texto =
 * el vendedor no lee dos explicaciones distintas del mismo problema.
 *
 * Cierra derivando al ADMIN a propósito: Ajustes › Integraciones es admin-only
 * (integracion.routes hace authorize('admin')), así que decirle a un vendedor
 * "cargalo ahí" es mandarlo a una pantalla que no existe para su rol.
 */
export function motivoCanalMetaNoConfigurado(estado: Pick<EstadoCanalMeta, 'etiqueta' | 'falta'>): string {
    const falta = estado.falta ?? 'falta terminar de configurar la integración';
    return `No se puede responder por ${estado.etiqueta.toLowerCase()}: ${falta}. `
        + 'Avisale a un administrador para que lo cargue en Ajustes › Integraciones.';
}

/**
 * De qué campo del config sale el token para hablarle a Meta en ese canal.
 * Devuelve el NOMBRE del campo, no el valor: lo guardado está cifrado y el que
 * llama tiene que pasarlo por descifrarSecreto() (este módulo es de dominio y
 * no conoce el secretBox). null = no hay token para ese canal.
 */
export function campoTokenParaCanal(
    config: unknown,
    canal: CanalMeta,
): 'pageAccessToken' | 'instagramAccessToken' | null {
    const c = comoConfig(config);
    const esDeInstagram = canal === 'instagram' || canal === 'instagram_comentario';
    // Instagram: si la app usó el flujo Instagram Login hay token propio; si no,
    // se le habla con el de la página (Facebook Login for Business).
    if (esDeInstagram && cargado(c.instagramAccessToken)) return 'instagramAccessToken';
    return cargado(c.pageAccessToken) ? 'pageAccessToken' : null;
}

/**
 * Id de cuenta que Meta pone en entry.id para ese objeto: sirve para verificar
 * que el evento es de esta integración y para reconocer nuestros propios
 * mensajes (sender.id === este id ⇒ lo mandamos nosotros, es un echo).
 * null si el admin todavía no lo cargó.
 */
export function idDeCuentaMeta(config: unknown, objeto: ObjetoWebhookMeta): string | null {
    const c = comoConfig(config);
    const id = objeto === 'page' ? c.pageId : c.igBusinessAccountId;
    return cargado(id) ? (id as string).trim() : null;
}
