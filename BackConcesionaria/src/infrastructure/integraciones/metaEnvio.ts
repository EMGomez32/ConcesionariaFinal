import { CanalConversacion } from '@prisma/client';
import { BaseException } from '../../domain/exceptions/BaseException';
import {
    ConfigMeta,
    campoTokenParaCanal,
    estadoCanalesMeta,
    idDeCuentaMeta,
    motivoCanalMetaNoConfigurado,
    VENTANA_MENSAJERIA_MS,
    esCanalMeta,
    esCanalDeMensajeria,
    esCanalDeComentarios,
    type CanalMetaConversacion,
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


// ─────────────────────────────────────────────────────────────────────────────
// Canales
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estos cuatro viven en `domain/services/canalesMeta` y se re-exportan acá para
 * no romper a quien ya los importaba de este módulo. Bajaron al dominio porque
 * son PUROS y los necesita la normalización de payloads, que tiene que poder
 * testearse sin levantar la base: este archivo arrastra `unitOfWork` -> `prisma`
 * -> `env`, y `env` valida y hace `process.exit` al importarse. Un unit test que
 * los importara desde acá se moría por falta de JWT_SECRET.
 */
export {
    VENTANA_MENSAJERIA_MS,
    esCanalMeta,
    esCanalDeMensajeria,
    esCanalDeComentarios,
} from '../../domain/services/canalesMeta';
export type { CanalMetaConversacion } from '../../domain/services/canalesMeta';

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
// Los errores de envío y la ventana de 24 h viven en el DOMINIO (son puros y se
// testean sin base). Se re-exportan acá para no romper a quien los importaba de
// este módulo, que es donde estaban.
// ─────────────────────────────────────────────────────────────────────────────

import {
    CanalMetaNoConfiguradoError,
    MetaError,
    VentanaMetaCerradaError,
    assertVentanaMetaAbierta,
    estadoVentanaMeta,
    type ConversacionMetaEnvio,
    type ErrorDeEnvio,
    type EstadoVentanaMeta,
    type HiloConVentanaMeta,
} from '../../domain/services/metaErrores';

export {
    CanalMetaNoConfiguradoError,
    MetaError,
    VentanaMetaCerradaError,
    assertVentanaMetaAbierta,
    estadoVentanaMeta,
};
export type { ConversacionMetaEnvio, ErrorDeEnvio, EstadoVentanaMeta, HiloConVentanaMeta };


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

/**
 * A dónde va la respuesta en Meta: la persona (DM) o el comentario RAÍZ del hilo
 * (comentarios). Tira el mismo error que ya tiraba cada camino si el hilo no lo
 * tiene guardado.
 *
 * Está separado porque lo usan los DOS modos: sin esto, el desvío de la
 * demostración habría tenido que repetir las dos frases —o peor, tragarse la
 * falta de destino y "enviar" igual—, y la demostración quedaría siendo MÁS
 * permisiva que la plataforma que dice reproducir.
 */
function destinoMeta(conversacion: ConversacionMetaEnvio, canal: CanalMetaConversacion): string {
    if (esCanalDeComentarios(canal)) {
        if (!conversacion.comentarioExternoId) {
            throw new CanalMetaNoConfiguradoError(
                'La conversación no tiene guardado el id del comentario, así que no se sabe en qué hilo publicar la respuesta.',
            );
        }
        return conversacion.comentarioExternoId;
    }
    if (!conversacion.contactoExternoId) {
        throw new CanalMetaNoConfiguradoError(
            'La conversación no tiene guardado el id del contacto en Meta, así que no hay a quién mandarle el mensaje.',
        );
    }
    return conversacion.contactoExternoId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo demostración
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿El hilo salió por una integración en modo demostración?
 *
 * El `where` es EL MISMO que el de `credencialesDe` (tenant a mano, tipo meta,
 * activa y sin borrar) a propósito: una integración demo apagada o borrada tiene
 * que caer en el mismo "está desactivada o fue eliminada" que una real, no
 * "enviarse" simulada en silencio. Por eso este chequeo no la encuentra y el
 * envío sigue de largo hasta el error de siempre.
 */
async function esIntegracionSimulada(conversacion: ConversacionMetaEnvio): Promise<boolean> {
    if (!conversacion.integracionId) return false;
    const integracion = await withAuthBypass((tx) => tx.integracionCanal.findFirst({
        where: {
            id: conversacion.integracionId as number,
            concesionariaId: conversacion.concesionariaId,
            tipo: 'meta',
            activo: true,
            deletedAt: null,
        },
        select: { modo: true },
    }));
    return integracion?.modo === 'demo';
}

/**
 * Secuencia dentro del proceso. Va junto al reloj porque dos respuestas
 * despachadas en el mismo milisegundo chocarían contra el unique
 * `[conversacionId, externoId]` de los mensajes.
 */
let secuenciaEnvioSimulado = 0;

/**
 * Registra el envío como exitoso SIN tocar la red, y devuelve un id que se
 * distingue a simple vista de uno de Meta.
 *
 * El id importa: el worker lo guarda en `mensaje.externoId`, que es la misma
 * columna donde va el `mid` real. Con prefijo `DEMO-` cualquiera que mire la
 * fila, el log o la burbuja sabe que eso no salió a ningún lado; un id con forma
 * de `m_AbC...` sería exactamente el dato falso que este desvío no puede
 * producir.
 */
function despacharSimulado(
    conversacion: ConversacionMetaEnvio,
    canal: CanalMetaConversacion,
    texto: string,
): { externoId: string } {
    const esComentario = esCanalDeComentarios(canal);
    // Mismos rechazos que el camino real: a un hilo sin destino no se le
    // "responde" ni siquiera simulando.
    destinoMeta(conversacion, canal);

    secuenciaEnvioSimulado += 1;
    // `DEMO-` + base36 del reloj: corto, ordenado en el tiempo e imposible de
    // confundir con un mid de Meta de un vistazo.
    const externoId = `${esComentario ? 'DEMO-COMMENT' : 'DEMO-MID'}`
        + `-${Date.now().toString(36).toUpperCase()}-${secuenciaEnvioSimulado}`;

    logger.info(
        `[meta-envio] hilo ${conversacion.id} (${canal}): SIMULADO — `
        + `${esComentario ? 'respuesta a comentario' : 'DM'} de ${texto.length} caracteres registrado `
        + `sin llamar a Meta (${externoId})`,
    );
    return { externoId };
}

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

    // ÚNICO desvío del modo demostración en toda la salida hacia Meta. Va ACÁ y
    // no en el service porque esta función es el embudo por el que sale TODO lo
    // que el sistema le manda a Meta: enganchándolo en este punto, la
    // demostración recorre exactamente el mismo código de negocio que el modo
    // real (encolar, el turno del worker, la política de reintentos, marcar
    // enviado, guardar el id externo) y no queda ni una regla duplicada en un
    // `if (demo)` que después se desincronice de la de verdad.
    //
    // Y va exactamente en este renglón:
    //  - DESPUÉS de `assertVentanaMetaAbierta`: en demostración la ventana de
    //    24 h SE RESPETA. Es la mitad de lo que hay que demostrar —el vendedor
    //    tiene que ver el composer bloqueado y entender por qué—, así que
    //    saltearla acá haría que la demo mienta justo sobre la regla que enseña.
    //  - ANTES de `credencialesDe`: esa función exige el token del canal y lo
    //    descifra. Una integración demo NO tiene credenciales (no hay ningún
    //    secreto real que guardar), así que ahí reventaría antes de llegar al
    //    fetch. Este es el punto donde el modo demostración deja de tocar la red
    //    y de exigir token, sin dejar de recorrer todo lo demás.
    // El costo es una lectura extra de la fila de la integración por envío: es
    // la misma que `credencialesDe` hace a continuación para las reales.
    if (await esIntegracionSimulada(conversacion)) return despacharSimulado(conversacion, canal, texto);

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
    const destinatario = destinoMeta(conversacion, canal);

    const respuesta = await llamarGraph<{ message_id?: string; recipient_id?: string }>(
        `${encodeURIComponent(emisorDeDm(canal, config))}/messages`,
        {
            token,
            method: 'POST',
            body: {
                recipient: { id: destinatario },
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
    const comentarioRaiz = destinoMeta(conversacion, canal);

    // Instagram usa /replies y Facebook /comments para lo mismo: colgar una
    // respuesta del comentario raíz. Las dos redes aplanan los hilos en dos
    // niveles, así que responder al raíz también es lo correcto para contestarle
    // a alguien que escribió dentro del hilo.
    const sufijo = canal === 'instagram_comentario' ? 'replies' : 'comments';

    const respuesta = await llamarGraph<{ id?: string }>(
        `${encodeURIComponent(comentarioRaiz)}/${sufijo}`,
        { token, method: 'POST', body: { message: texto } },
    );

    logger.info(`[meta-envio] hilo ${conversacion.id} (${conversacion.canal}): comentario respondido (${respuesta.id ?? 's/id'})`);
    return { externoId: respuesta.id ?? null };
}
