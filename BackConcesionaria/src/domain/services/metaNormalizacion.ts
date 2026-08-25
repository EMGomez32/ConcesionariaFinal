import { TipoMensajeWhatsapp } from '@prisma/client';
import {
    CanalMetaConversacion,
    esCanalDeComentarios,
    esCanalDeMensajeria,
} from './canalesMeta';

/**
 * NORMALIZACIÓN de los payloads entrantes de Meta.
 *
 * Vive en el dominio y no al lado de la ingesta porque es PURO —entra un JSON de
 * Meta, sale un evento nuestro— y porque así se puede testear sin levantar nada:
 * `infrastructure/integraciones/metaCanales` arrastra `prisma`, y `prisma`
 * importa `env`, que valida y hace `process.exit(1)` en el import. Un unit test
 * que importara los normalizadores desde allá se moría por falta de JWT_SECRET,
 * que es exactamente lo que pasó en CI: el job de unit tests sólo define un
 * DATABASE_URL dummy, a propósito, porque los unit tests de este repo son puros.
 *
 * Las cuatro formas que llegan (DM de Messenger, DM de Instagram, comentario de
 * página y comentario de Instagram) no se parecen entre sí y Meta las manda todas
 * a la MISMA URL. Equivocarse acá no rompe nada visible: el webhook contesta 200
 * igual y el mensaje simplemente no aparece nunca.
 */

// ─────────────────────────────────────────────────────────────────────────────
// El evento normalizado
// ─────────────────────────────────────────────────────────────────────────────

export interface EventoEntranteMeta {
    canal: CanalMetaConversacion;
    /** Id del mensaje (`mid`) o del comentario en Meta. La CLAVE de idempotencia. */
    externoId: string;
    /**
     * Id del usuario en Meta: PSID (Messenger) o IGSID (Instagram). Está scopeado
     * a la app/página, así que NO es un id global de la persona: el mismo humano
     * tiene ids distintos en dos páginas distintas.
     */
    contactoExternoId: string;
    /** Lo que traiga el payload; para los DM se completa contra el Graph API. */
    nombreContacto: string | null;
    contenido: string;
    tipo: TipoMensajeWhatsapp;
    fecha: Date;
    /** Sólo comentarios: publicación y comentario RAÍZ del hilo. */
    postExternoId: string | null;
    comentarioExternoId: string | null;
}

/** Contexto de la notificación que los normalizadores necesitan además del `value`. */
export interface ContextoNotificacion {
    /** `payload.object`: 'page' (Messenger/Facebook) o 'instagram'. */
    objeto: string;
    /** `entry.id`: la página o la cuenta de Instagram que recibió el evento. */
    entryId: string;
    /** pageId / igBusinessAccountId del config, para reconocer lo NUESTRO. */
    idsPropios: string[];
    /** `entry.time`: fallback para los payloads que no traen fecha propia. */
    fechaEntry?: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de normalización
// ─────────────────────────────────────────────────────────────────────────────

/** Lo usa también la ingesta al leer el perfil del Graph API. */
export const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const id = (v: unknown): string =>
    typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';

/**
 * Meta manda ms en `messaging[].timestamp` y SEGUNDOS en `created_time` del feed.
 *
 * `'auto'` es para `entry.time`, que NO tiene una escala fija: en las
 * notificaciones de `messaging[]` viene en ms y en las de `changes[]` (feed y
 * comments) viene en SEGUNDOS. Se distingue por magnitud, que no es ambiguo: un
 * timestamp de cualquier fecha entre 2015 y 2100 mide ~1e9 en segundos y ~1e12
 * en milisegundos, tres órdenes de diferencia. El corte en 1e11 cae en el medio
 * (año 5138 leído como segundos, 1973 leído como ms), así que ningún valor
 * plausible se clasifica mal.
 */
const fechaDe = (valor: unknown, escala: 'ms' | 's' | 'auto', porDefecto?: Date): Date =>
    interpretarTimestamp(valor, escala) ?? porDefecto ?? new Date();

/**
 * Convierte un timestamp de Meta a Date, o null si no se puede confiar en él.
 *
 * Devolver null en vez de una fecha inventada es lo que deja que cada llamador
 * elija su propio respaldo: un timestamp corrupto que caiga en 1970 o en el año
 * 3000 desordenaría la bandeja para siempre, porque lista por ultimoMensajeAt.
 */
const interpretarTimestamp = (valor: unknown, escala: 'ms' | 's' | 'auto'): Date | null => {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) return null;
    const enSegundos = escala === 's' || (escala === 'auto' && n < 1e11);
    const fecha = new Date(enSegundos ? n * 1000 : n);
    const año = fecha.getUTCFullYear();
    return año >= 2015 && año <= 2100 ? fecha : null;
};

/**
 * Fecha de `entry.time`, la que se usa como respaldo cuando el evento no trae
 * timestamp propio — el caso de los COMENTARIOS DE INSTAGRAM, que no traen
 * ninguno.
 *
 * Tiene que pasar por `fechaDe` y no por `new Date(Number(...))`: `entry.time`
 * de una notificación de `changes[]` viene en segundos, así que interpretarlo
 * como ms fecha el comentario en 1970. Y un hilo con fecha de 1970 no es un
 * detalle cosmético: la bandeja ordena por `ultimoMensajeAt`, así que el
 * comentario se hunde al fondo de la lista y el vendedor no lo ve NUNCA, sin
 * ningún error que lo delate.
 */
export const fechaDeEntry = (time: unknown): Date | undefined =>
    // `?? undefined` y no una fecha inventada: si `entry.time` viniera corrupto,
    // que cada normalizador caiga en su propio respaldo (la hora de llegada) en
    // vez de propagar basura a los cuatro canales de la notificación.
    interpretarTimestamp(time, 'auto') ?? undefined;

/** `contenido` es texto libre pero no infinito: la bandeja lo lista entero. */
const LIMITE_CONTENIDO = 4000;
const recortar = (s: string): string => s.slice(0, LIMITE_CONTENIDO);

const TIPOS_ADJUNTO: Record<string, TipoMensajeWhatsapp> = {
    image: 'imagen',
    video: 'video',
    audio: 'audio',
    file: 'documento',
    location: 'ubicacion',
};

const DESCRIPCION_ADJUNTO: Record<string, string> = {
    image: '[imagen]',
    video: '[video]',
    audio: '[audio]',
    file: '[archivo]',
    location: '[ubicación]',
    share: '[publicación compartida]',
    story_mention: '[te mencionó en su historia]',
    template: '[mensaje con botones]',
    fallback: '[contenido no soportado]',
};

/**
 * Un DM puede venir sin texto (una foto suelta, un audio, una mención en una
 * historia). `contenido` es NOT NULL y además es lo que el vendedor lee en la
 * lista de la bandeja: dejarlo vacío mostraría un hilo en blanco.
 */
function describirAdjuntos(adjuntos: unknown): { descripcion: string; tipo: TipoMensajeWhatsapp } {
    const lista = Array.isArray(adjuntos) ? adjuntos : [];
    if (!lista.length) return { descripcion: '', tipo: 'texto' };

    const partes: string[] = [];
    let tipo: TipoMensajeWhatsapp = 'texto';
    for (const adj of lista) {
        const clase = texto((adj as Record<string, unknown>)?.type).toLowerCase();
        partes.push(DESCRIPCION_ADJUNTO[clase] ?? `[${clase || 'adjunto'}]`);
        // El tipo de la fila lo fija el PRIMER adjunto reconocido: la bandeja
        // muestra un solo ícono por mensaje.
        if (tipo === 'texto' && TIPOS_ADJUNTO[clase]) tipo = TIPOS_ADJUNTO[clase];
    }
    return { descripcion: partes.join(' '), tipo };
}

/** ¿El autor es la propia página/cuenta? (nuestra respuesta volviendo por el webhook) */
const esAutorPropio = (autorId: string, ctx: ContextoNotificacion): boolean =>
    autorId === ctx.entryId || ctx.idsPropios.some((propio) => propio && propio === autorId);

// ─────────────────────────────────────────────────────────────────────────────
// 1. DM — object 'page' (Messenger) y object 'instagram' (Instagram)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza UN elemento de `entry[].messaging[]`.
 *
 * OJO CON LA FORMA: los DM NO llegan en `entry[].changes[]` como el leadgen y
 * los comentarios — llegan en `messaging[]`, un array HERMANO. Mirando sólo
 * `changes` los DM entran, validan firma, contestan 200 y se pierden sin dejar
 * rastro (era exactamente el estado anterior de este webhook).
 *
 * Messenger y DM de Instagram vienen con una forma casi idéntica: lo único que
 * los distingue es `payload.object`, por eso llega en el contexto.
 *
 * PERMISOS DE META que exige RECIBIR esto, y qué pasa si NO están aprobados:
 *   - Messenger (`object: 'page'`, campo `messages`): la página suscripta a la
 *     app, y `pages_messaging` para poder contestar. En modo desarrollo el
 *     webhook SÓLO dispara para gente con rol en la app (admin/dev/tester): si
 *     se prueba con una cuenta cualquiera no llega NADA y no hay ningún error
 *     que lo diga — el silencio ES el síntoma.
 *   - Instagram (`object: 'instagram'`, campo `messages`):
 *     `instagram_business_basic` + `instagram_business_manage_messages` (flujo
 *     Instagram Login) o `instagram_manage_messages` (Facebook Login for
 *     Business). Sin App Review sólo entran mensajes de hasta 25 usuarios de
 *     prueba. Además la cuenta tiene que ser PROFESIONAL, estar vinculada a la
 *     página, y tener prendido el acceso a mensajes de herramientas conectadas
 *     en la app de Instagram; con eso apagado el webhook no dispara nunca.
 *
 * Devuelve null (descartar en silencio) para todo lo que no es un mensaje de la
 * persona: acks de entrega/lectura, reacciones, postbacks, referrals y ECHOES.
 */
export function normalizarMensajeria(
    evento: unknown,
    ctx: ContextoNotificacion,
): EventoEntranteMeta | null {
    const e = (evento ?? {}) as Record<string, any>;
    const mensaje = e.message as Record<string, any> | undefined;

    // `read`, `delivery`, `reaction`, `postback`, `referral`, `optin`: no son
    // mensajes y no van a la bandeja.
    if (!mensaje || typeof mensaje !== 'object') return null;

    // ECHO: un mensaje que mandamos NOSOTROS (desde el panel, desde la app de
    // Meta o desde Business Suite) y que Meta reentrega por este mismo webhook.
    //
    // Se DESCARTA. Sin este filtro, cada respuesta del vendedor aparece DOS
    // veces en su propia bandeja: la que escribió y la que le rebotó.
    //
    // La alternativa —ingerirlo como saliente, que es lo que hace WhatsApp con
    // `propio`— depende de que el `message_id` que devuelve la Send API sea
    // idéntico al `mid` del echo, porque esa igualdad es lo ÚNICO que haría que
    // la deduplicación por `externoId` lo reconociera. Para Messenger se cumple;
    // para los DM de Instagram no está verificado contra la API real, y una
    // burbuja duplicada en producción es peor que todavía no ver las respuestas
    // que un compañero mandó desde el celular.
    //
    // Para habilitarlo cuando se confirme: tomar `contactoExternoId` de
    // `recipient.id` — en un echo el sender es la PÁGINA y el recipient la
    // persona, vienen dados vuelta, y usar `sender.id` abriría un hilo fantasma
    // contra nuestra propia página.
    if (mensaje.is_echo === true) return null;

    // Mensaje borrado ("unsend") de Instagram: no hay contenido que mostrar.
    if (mensaje.is_deleted === true) return null;

    const externoId = id(mensaje.mid);
    const contactoExternoId = id(e.sender?.id);
    if (!externoId || !contactoExternoId) return null;

    // Defensa extra: si el remitente es la propia página y no vino marcado como
    // echo, tampoco es un mensaje entrante.
    if (esAutorPropio(contactoExternoId, ctx)) return null;

    const canal: CanalMetaConversacion = ctx.objeto === 'instagram' ? 'instagram' : 'messenger';

    const cuerpo = texto(mensaje.text);
    const { descripcion, tipo } = describirAdjuntos(mensaje.attachments);
    // Respuesta a una historia nuestra: sin el prefijo, el vendedor lee un
    // "sí, me interesa" suelto sin saber a qué le están contestando.
    const prefijo = mensaje.reply_to?.story ? '[respondió a tu historia]' : '';

    // Ni texto ni adjuntos reconocibles (p. ej. `is_unsupported`): igual entra,
    // porque el hilo tiene que existir para poder contestarlo.
    const armado = recortar([prefijo, cuerpo, descripcion].filter(Boolean).join(' '));

    return {
        canal,
        externoId,
        contactoExternoId,
        // Los DM no traen el nombre en el payload: se resuelve best-effort
        // contra el Graph API una sola vez, al dar de alta el hilo.
        nombreContacto: null,
        contenido: armado || '[mensaje sin texto]',
        tipo: armado ? tipo : 'texto',
        fecha: fechaDe(e.timestamp, 'ms', ctx.fechaEntry),
        postExternoId: null,
        comentarioExternoId: null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Comentarios de la página de Facebook — object 'page', campo 'feed'
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza un `changes[]` con `field: 'feed'`.
 *
 * `feed` es un cajón de sastre: por ahí pasan posts, reacciones, shares,
 * ediciones y borrados. Los comentarios son los que traen `value.item ===
 * 'comment'` y `value.verb === 'add'`; TODO lo demás se descarta. Un
 * `verb: 'edited'` o `'remove'` tampoco entra: la bandeja muestra la
 * conversación tal como ocurrió.
 *
 * PERMISOS DE META que exige este canal, y qué pasa si NO están aprobados:
 *   - `pages_manage_metadata` para poder SUSCRIBIR el campo `feed`. Sin eso ni
 *     siquiera se puede activar la suscripción: falla al configurarla.
 *   - `pages_read_user_content` para que `value.message` de un comentario de un
 *     tercero venga CON texto. Sin ese permiso aprobado Meta igual manda la
 *     notificación, pero con el contenido recortado: llegan comentarios vacíos
 *     y parece un bug nuestro.
 *   - `pages_manage_engagement` para poder responder (ver metaEnvio.ts).
 */
export function normalizarComentarioFeed(
    valor: unknown,
    ctx: ContextoNotificacion,
): EventoEntranteMeta | null {
    const v = (valor ?? {}) as Record<string, any>;
    if (texto(v.item).toLowerCase() !== 'comment') return null;
    if (texto(v.verb).toLowerCase() !== 'add') return null;

    const externoId = id(v.comment_id);
    const autorId = id(v.from?.id);
    if (!externoId || !autorId) return null;

    // Nuestra propia respuesta vuelve por el webhook igual que el echo de un DM:
    // la página comenta y Meta nos avisa. Sin este filtro cada respuesta del
    // vendedor se duplicaría en el hilo.
    if (esAutorPropio(autorId, ctx)) return null;

    const postExternoId = id(v.post_id) || null;

    return {
        canal: 'facebook_comentario',
        externoId,
        contactoExternoId: autorId,
        nombreContacto: texto(v.from?.name) || null,
        contenido: recortar(texto(v.message)) || '[comentario sin texto]',
        tipo: 'texto',
        fecha: fechaDe(v.created_time, 's', ctx.fechaEntry),
        postExternoId,
        comentarioExternoId: raizDelHilo(externoId, id(v.parent_id) || null, postExternoId),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Comentarios de Instagram — object 'instagram', campo 'comments'
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza un `changes[]` con `field: 'comments'`.
 *
 * A diferencia del `feed` de Facebook, acá NO viene `verb` ni `item`: el campo
 * `comments` sólo notifica altas, así que no hay nada que filtrar por acción.
 * Tampoco trae timestamp propio: se cae al `entry.time` de la notificación.
 *
 * PERMISOS DE META que exige este canal, y qué pasa si NO están aprobados:
 *   - `instagram_manage_comments` (o `instagram_business_manage_comments` en el
 *     flujo Instagram Login). Sin App Review sólo llegan comentarios de las
 *     cuentas de prueba de la app; con una cuenta real no dispara nada y no hay
 *     error en ningún lado — otra vez, el silencio es el síntoma.
 *   - La cuenta tiene que ser PROFESIONAL y estar vinculada a la página.
 *
 * Meta no notifica los comentarios que hace la propia cuenta sobre su contenido,
 * pero el filtro de "propio" va igual: depende de la versión de la API y no
 * cuesta nada.
 */
export function normalizarComentarioInstagram(
    valor: unknown,
    ctx: ContextoNotificacion,
): EventoEntranteMeta | null {
    const v = (valor ?? {}) as Record<string, any>;

    const externoId = id(v.id);
    const autorId = id(v.from?.id);
    if (!externoId || !autorId) return null;
    if (esAutorPropio(autorId, ctx)) return null;

    const postExternoId = id(v.media?.id) || null;

    return {
        canal: 'instagram_comentario',
        externoId,
        contactoExternoId: autorId,
        // IG manda `username` (el @), no el nombre real: es lo que el vendedor
        // ve en la app de Instagram, así que es lo que tiene que ver acá.
        nombreContacto: texto(v.from?.username) || null,
        contenido: recortar(texto(v.text)) || '[comentario sin texto]',
        tipo: 'texto',
        fecha: fechaDe(v.timestamp ?? v.created_time, 's', ctx.fechaEntry),
        postExternoId,
        comentarioExternoId: raizDelHilo(externoId, id(v.parent_id) || null, postExternoId),
    };
}

/**
 * Comentario RAÍZ del hilo: es lo que define la conversación y a dónde se cuelga
 * la respuesta.
 *
 * Facebook e Instagram aplanan los comentarios en DOS niveles (el comentario y
 * sus respuestas; no hay tercer nivel). Si `parent_id` apunta a otro comentario,
 * ESE es la raíz; si apunta al post (Facebook manda el post_id como parent de
 * los comentarios de primer nivel) o no viene, la raíz es el comentario mismo.
 * Guardar la raíz —y no el id del comentario suelto— es lo que hace que la
 * respuesta salga en el hilo correcto y que toda una discusión caiga en la MISMA
 * conversación de la bandeja en vez de abrir una por respuesta.
 */
function raizDelHilo(propioId: string, parentId: string | null, postId: string | null): string {
    if (!parentId) return propioId;
    if (postId && parentId === postId) return propioId;
    return parentId;
}

// ─────────────────────────────────────────────────────────────────────────────
// La clave del hilo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `claveHilo` de los canales de Meta, en el mismo formato `<ámbito>:<id>` que usa
 * WhatsApp (`conversacionService.claveHiloDe` → `<cuenta>:<telefono>`).
 *
 *   DM          → `<integracionId>:<contactoExternoId>`   (PSID / IGSID)
 *   Comentarios → `<integracionId>:<comentarioRaízId>`     (un hilo por discusión)
 *
 * El ámbito es la INTEGRACIÓN, no la concesionaria, por la misma razón que en
 * WhatsApp es la cuenta: el PSID/IGSID es un id SCOPED a la página, así que dos
 * páginas del mismo tenant pueden entregar ids que no significan la misma
 * persona. Sin el prefijo, dos integraciones de la misma concesionaria
 * colisionarían en un solo hilo.
 *
 * Que la integración alcance como ámbito depende de que UNA integración reciba
 * eventos de UNA sola página/cuenta. Eso no lo garantiza Meta (la URL de
 * callback se suscribe por app y varias páginas notifican a la misma) sino el
 * webhook, que descarta los entry cuyo `entry.id` no es la cuenta configurada
 * (ver metaWebhook). Si algún día se soportan varias páginas por integración,
 * el `entry.id` tiene que entrar también en esta clave.
 *
 * Para los comentarios la clave es el comentario RAÍZ y no el par post+comentario:
 * el id del comentario ya es único dentro de la página, y el post queda guardado
 * aparte en `postExternoId` para poder linkear a la publicación.
 */
export function claveHiloDe(integracionId: number, evento: EventoEntranteMeta): string {
    const identificador = esCanalDeComentarios(evento.canal)
        ? evento.comentarioExternoId ?? evento.externoId
        : evento.contactoExternoId;
    return `${integracionId}:${identificador}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistencia
