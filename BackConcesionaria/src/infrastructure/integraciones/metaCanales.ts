import { IntegracionCanal, TipoMensajeWhatsapp } from '@prisma/client';
import prisma from '../database/prisma';
import { logger } from '../logging/logger';
import { conContextoSistema } from '../../application/services/consultaIngest';
import { ConfigMeta, campoTokenParaCanal } from '../../domain/services/canalesMeta';
import { descifrarSecreto } from '../security/secretBox';
import {
    CanalMetaConversacion,
    VENTANA_MENSAJERIA_MS,
    esCanalDeComentarios,
    esCanalDeMensajeria,
    llamarGraph,
} from './metaEnvio';

/**
 * ENTRADA de los canales de Meta que no son Lead Ads: DM de Instagram, DM de
 * Messenger, comentarios de Instagram y comentarios de la página de Facebook.
 *
 * Dos etapas separadas a propósito:
 *   1. NORMALIZAR (funciones puras `normalizar*`): del payload crudo de Meta a
 *      un `EventoEntranteMeta`. Son puras para poder testearlas con un payload
 *      de ejemplo sin base ni red — hoy la integración de Meta no tiene NI UN
 *      test y estas cuatro formas de payload no se parecen entre sí.
 *   2. PERSISTIR (`ingestarEventoMeta`): crear o reabrir el hilo del canal y
 *      appendear el mensaje entrante.
 *
 * Esta ingesta es la DUEÑA de los hilos de Meta: arma su propia `claveHilo` y
 * corre la ventana de 24 h. La bandeja (conversacionService) es dueña de los de
 * WhatsApp y de los requests del panel. Están separadas porque cada mundo
 * identifica al contacto con algo distinto y mezclarlas fue justamente lo que el
 * unique viejo [whatsappCuentaId, telefono] no soportaba.
 *
 * TENANT: acá NO hay request. Todo lo que toca la base corre dentro de
 * `conContextoSistema(concesionariaId, ...)` para que la extensión de Prisma
 * inyecte el tenant y setee las GUC de RLS. Con `rawPrisma` pelado las queries
 * devuelven CERO filas EN SILENCIO y el webhook parece andar sin hacer nada.
 *
 * IDEMPOTENCIA: Meta REINTENTA las notificaciones ante cualquier no-200 (y a
 * veces sin motivo). La clave es `externoId` — el `mid` del mensaje o el id del
 * comentario — con el unique [conversacionId, externoId] como red de seguridad
 * contra la carrera. Sin esto, cada reintento duplica una burbuja del chat.
 *
 * LO QUE NO SE HACE, A PROPÓSITO: no se llama a `ingestarConsulta`. Un DM no
 * trae teléfono ni email, y `buscarClientePorContacto` sin ninguno de los dos
 * devuelve null SIEMPRE → cada mensaje crearía una ficha de cliente nueva y el
 * CRM se llenaría de huérfanos. El hilo entra a la bandeja y el vendedor lo
 * convierte en lead con el botón que ya existe (`registrarConsulta`).
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

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

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
// ─────────────────────────────────────────────────────────────────────────────

/** Un evento reentregado choca contra un unique: no es un error real. */
const esConflictoUnico = (err: unknown): boolean =>
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

export type ResultadoIngesta = 'nuevo' | 'duplicado';

/** Lo que se lee del hilo para decidir cómo actualizarlo. */
interface HiloMeta {
    id: number;
    estado: string;
    nombreContacto: string | null;
    ventanaVenceAt: Date | null;
}

/**
 * Persiste un evento normalizado: crea o reabre el hilo del canal y le appendea
 * el mensaje entrante.
 *
 * Corre entero dentro de `conContextoSistema`: no hay request, así que sin eso
 * la extensión no inyecta el tenant y la RLS filtra TODO a cero filas en
 * silencio (ya pasó tres veces en este repo).
 */
export async function ingestarEventoMeta(
    integracion: IntegracionCanal,
    evento: EventoEntranteMeta,
): Promise<ResultadoIngesta> {
    return conContextoSistema(integracion.concesionariaId, async () => {
        const hilo = await obtenerOCrearHilo(integracion, evento);

        // IDEMPOTENCIA, primera capa: el chequeo previo evita el trabajo en el
        // caso normal (Meta reintenta segundos después). La segunda capa es el
        // catch del P2002 contra el unique [conversacionId, externoId], que
        // cubre la carrera de dos reintentos simultáneos.
        const yaEsta = await prisma.mensajeWhatsapp.findFirst({
            where: { conversacionId: hilo.id, externoId: evento.externoId },
            select: { id: true },
        });
        if (yaEsta) return 'duplicado';

        try {
            await prisma.mensajeWhatsapp.create({
                data: {
                    // concesionariaId lo inyecta la extensión desde el contexto.
                    conversacionId: hilo.id,
                    direccion: 'entrante',
                    tipo: evento.tipo,
                    contenido: evento.contenido,
                    estado: 'recibido',
                    externoId: evento.externoId,
                    createdAt: evento.fecha,
                } as never,
            });
        } catch (err) {
            if (esConflictoUnico(err)) return 'duplicado';
            throw err;
        }

        await actualizarHilo(hilo, evento);

        // Los comentarios ya traen el nombre en el payload; los DM no.
        if (!hilo.nombreContacto && !evento.nombreContacto) {
            await completarNombreContacto(integracion, hilo.id, evento);
        }
        return 'nuevo';
    });
}

async function actualizarHilo(hilo: HiloMeta, evento: EventoEntranteMeta): Promise<void> {
    // La ventana se cuenta desde la FECHA DEL MENSAJE, no desde ahora: Meta
    // puede entregar tarde y el plazo real corre desde que la persona escribió.
    // Y nunca se achica: si dos mensajes llegan desordenados, gana el más nuevo.
    let ventanaVenceAt: Date | undefined;
    if (esCanalDeMensajeria(evento.canal)) {
        const candidata = new Date(evento.fecha.getTime() + VENTANA_MENSAJERIA_MS);
        if (!hilo.ventanaVenceAt || candidata > hilo.ventanaVenceAt) ventanaVenceAt = candidata;
    }

    await prisma.conversacion.update({
        where: { id: hilo.id },
        data: {
            ultimoMensajeAt: evento.fecha,
            ultimoMensajeDir: 'entrante',
            noLeidos: { increment: 1 },
            ...(ventanaVenceAt ? { ventanaVenceAt } : {}),
            // El nombre se guarda la primera vez que se conoce y no se pisa: el
            // operador puede haberlo corregido a mano.
            ...(hilo.nombreContacto || !evento.nombreContacto
                ? {}
                : { nombreContacto: evento.nombreContacto }),
            // Un hilo CERRADO que recibe algo nuevo vuelve a la bandeja (mismo
            // criterio que WhatsApp). 'archivada' se respeta: es una decisión
            // explícita del operador.
            ...(hilo.estado === 'cerrada' ? { estado: 'abierta' } : {}),
        },
    });
}

/**
 * Busca el hilo por [canal, claveHilo] dentro del tenant, o lo crea.
 *
 * NO vincula un Cliente: un IGSID/PSID no es teléfono ni email, así que el
 * dedupe de `buscarClientePorContacto` no puede matchear nada y crearía una
 * ficha nueva por mensaje. El vínculo lo hace el vendedor con "registrar
 * consulta" desde la bandeja.
 */
async function obtenerOCrearHilo(
    integracion: IntegracionCanal,
    evento: EventoEntranteMeta,
): Promise<HiloMeta> {
    const claveHilo = claveHiloDe(integracion.id, evento);
    const seleccion = { id: true, estado: true, nombreContacto: true, ventanaVenceAt: true };
    const buscar = () => prisma.conversacion.findFirst({
        where: { canal: evento.canal, claveHilo },
        select: seleccion,
    });

    const existente = await buscar();
    if (existente) return existente as HiloMeta;

    try {
        const creada = await prisma.conversacion.create({
            data: {
                // concesionariaId lo inyecta la extensión desde el contexto.
                canal: evento.canal,
                claveHilo,
                integracionId: integracion.id,
                // Los dos son nullable justamente para esto: un hilo de Meta no
                // tiene cuenta de WhatsApp ni teléfono.
                whatsappCuentaId: null,
                telefono: null,
                contactoExternoId: evento.contactoExternoId,
                postExternoId: evento.postExternoId,
                comentarioExternoId: evento.comentarioExternoId,
                nombreContacto: evento.nombreContacto,
                clienteId: null,
                estado: 'abierta',
                ultimoMensajeAt: evento.fecha,
                ultimoMensajeDir: 'entrante',
                ...(esCanalDeMensajeria(evento.canal)
                    ? { ventanaVenceAt: new Date(evento.fecha.getTime() + VENTANA_MENSAJERIA_MS) }
                    : {}),
            } as never,
            select: seleccion,
        });
        return creada as HiloMeta;
    } catch (err) {
        // Carrera contra otro mensaje del mismo contacto: el unique
        // [concesionariaId, canal, claveHilo] la resolvió; nos quedamos con la
        // fila que ganó.
        if (!esConflictoUnico(err)) throw err;
        const ganadora = await buscar();
        if (!ganadora) throw err;
        return ganadora as HiloMeta;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Nombre del contacto (best-effort)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resuelve el nombre contra el Graph API y lo guarda si el hilo todavía no tiene.
 *
 * BEST-EFFORT y a propósito: si falla —permiso sin aprobar, token vencido, la
 * persona con el perfil restringido— la conversación YA entró y no se toca. Un
 * hilo sin nombre es perfectamente atendible; un mensaje perdido, no.
 *
 * Se consulta UNA sola vez por hilo (sólo cuando `nombreContacto` está en null):
 * es una llamada extra a la API por interesado nuevo, no por mensaje.
 *
 * PERMISOS: para un PSID de Messenger alcanza `pages_messaging` (la persona ya
 * le escribió a la página). Para un IGSID hace falta el permiso de mensajes de
 * Instagram. Sin aprobación devuelve 400/403 y el hilo queda sin nombre, que es
 * feo pero no rompe nada.
 */
async function completarNombreContacto(
    integracion: IntegracionCanal,
    conversacionId: number,
    evento: EventoEntranteMeta,
): Promise<void> {
    try {
        const nombre = await nombreDesdeGraph(integracion, evento);
        if (!nombre) return;
        await prisma.conversacion.update({
            where: { id: conversacionId },
            data: { nombreContacto: nombre },
        });
        logger.debug(`[meta-canales] hilo ${conversacionId}: contacto resuelto como "${nombre}"`);
    } catch (err) {
        logger.warn(
            `[meta-canales] integración ${integracion.id}: no se pudo completar el nombre del hilo ${conversacionId}: `
            + (err instanceof Error ? err.message : String(err)),
        );
    }
}

/** Consulta el perfil en el Graph API. Devuelve null ante cualquier problema. */
async function nombreDesdeGraph(
    integracion: IntegracionCanal,
    evento: EventoEntranteMeta,
): Promise<string | null> {
    const config = (integracion.config ?? {}) as ConfigMeta;
    const esInstagram = evento.canal === 'instagram' || evento.canal === 'instagram_comentario';
    // De qué campo sale el token lo decide el dominio (canalesMeta); acá sólo se
    // descifra, que es lo que infraestructura sí puede hacer.
    const campo = campoTokenParaCanal(config, evento.canal);
    const crudo = campo ? config[campo] : '';
    if (!crudo) return null;

    try {
        const perfil = await llamarGraph<Record<string, unknown>>(
            encodeURIComponent(evento.contactoExternoId),
            {
                token: descifrarSecreto(crudo),
                // name/username son de Instagram; first_name/last_name de Messenger.
                query: { fields: esInstagram ? 'name,username' : 'first_name,last_name' },
                timeoutMs: 5_000,
            },
        );

        if (esInstagram) return texto(perfil.name) || texto(perfil.username) || null;
        return [texto(perfil.first_name), texto(perfil.last_name)].filter(Boolean).join(' ') || null;
    } catch (err) {
        logger.warn(
            `[meta-canales] integración ${integracion.id}: el Graph API no devolvió el nombre de ${evento.contactoExternoId}: `
            + (err instanceof Error ? err.message : String(err)),
        );
        return null;
    }
}
