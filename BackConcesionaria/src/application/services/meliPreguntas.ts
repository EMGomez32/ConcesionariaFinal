import { EstadoPreguntaMl, MercadoLibreCuenta, PreguntaMl, Prisma } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { withAuthBypass } from '../../infrastructure/database/unitOfWork';
import { context } from '../../infrastructure/security/context';
import { BaseException, ForbiddenException, NotFoundException } from '../../domain/exceptions/BaseException';
import { logger } from '../../infrastructure/logging/logger';
import { llamarApi } from '../../infrastructure/mercadolibre/meliClient';
import { conContextoSistema, ingestarConsulta } from './consultaIngest';
import { reconciliarPublicacion } from './meliPublicacion';

/**
 * Preguntas de Mercado Libre: bandeja de consultas del canal.
 *
 * Tres mundos entran acá y cada uno resuelve el tenant distinto:
 *  - El WORKER de sincronización (`ingestarPreguntasDeCuenta`), que corre sin
 *    request: la cuenta se resuelve por bypass de RLS y el trabajo se hace
 *    dentro de `conContextoSistema(concesionariaId, ...)`.
 *  - El WEBHOOK público (`procesarNotificacionMl`), que además de no tener
 *    request tampoco sabe a qué concesionaria pertenece la notificación: sólo
 *    llega el `user_id` de Mercado Libre, así que hay que buscar la cuenta A
 *    CIEGAS en todos los tenants.
 *  - Los REQUESTS del panel (responder / asignar / lead / listar), donde el
 *    tenant ya viene del JWT y la extensión de Prisma scopea sola.
 *
 * La idempotencia es un requisito del protocolo, no una prolijidad: Mercado
 * Libre REENVÍA la misma notificación varias veces (y el worker vuelve a
 * barrer las mismas preguntas cada corrida). Por eso todo entra por un upsert
 * contra el unique `mlQuestionId`, y el upsert nunca pisa las decisiones
 * locales (asignación, cliente vinculado, quién respondió).
 */

/** Tope de la búsqueda de preguntas por página (máximo cómodo de la API). */
const LIMITE_BUSQUEDA = 50;

/**
 * Páginas que se recorren de las SIN RESPONDER. Con una sola página, un
 * vendedor con más de 50 preguntas viejas nunca vería el fondo de la cola.
 */
const PAGINAS_SIN_RESPONDER = 4;

/** Mercado Libre corta las respuestas en 2000 caracteres. */
const LIMITE_RESPUESTA = 2000;

/** Tope del cache de nicknames: se limpia entero al llegar (no es un LRU). */
const MAX_NICKNAMES = 500;

const ESTADOS_PREGUNTA: string[] = ['sin_responder', 'respondida', 'eliminada'];

const mensajeCorto = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err)).slice(0, 300);

const entero = (valor: unknown): number | null => {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Vendedor "puro": tiene el rol vendedor y ninguno de los que ven todo el
 * tenant. Mismo criterio que la bandeja de WhatsApp.
 */
const esVendedorPuro = (): boolean => {
    const roles = context.getUser()?.roles ?? [];
    return roles.includes('vendedor') && !roles.includes('admin') && !roles.includes('super_admin');
};

/** Un vendedor puro sólo atiende lo suyo o lo que está sin asignar. */
function assertPuedeAtender(asignadoAId: number | null): void {
    if (!esVendedorPuro()) return;
    const userId = context.getUser()?.userId ?? 0;
    if (asignadoAId !== null && asignadoAId !== userId) {
        throw new ForbiddenException('La pregunta está asignada a otro vendedor');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Forma de la API de Mercado Libre
// ─────────────────────────────────────────────────────────────────────────────

/** Pregunta tal como la devuelve `/questions/search` y `/questions/{id}` (api_version 4). */
interface PreguntaApiMl {
    id: number | string;
    /** Vendedor dueño de la publicación. Es lo único que permite validar que la
     *  pregunta traída por una notificación PÚBLICA sea realmente de esta cuenta. */
    seller_id?: number | string;
    text?: string;
    /** UNANSWERED | ANSWERED | CLOSED_UNANSWERED | UNDER_REVIEW | BANNED | DELETED. */
    status?: string;
    date_created?: string;
    item_id?: string;
    from?: { id?: number | string; nickname?: string };
    answer?: { text?: string; status?: string; date_created?: string } | null;
}

interface BusquedaPreguntasMl {
    total?: number;
    questions?: PreguntaApiMl[];
}

/**
 * Traduce el estado de ML al nuestro. Todo lo que ya no se puede contestar
 * (borrada, cerrada, baneada) cae en 'eliminada' para que salga de la cola de
 * trabajo sin desaparecer del historial.
 */
function mapearEstado(status: string | undefined): EstadoPreguntaMl {
    switch ((status ?? '').toUpperCase()) {
        case 'ANSWERED':
            return 'respondida';
        case 'DELETED':
        case 'CLOSED_UNANSWERED':
        case 'BANNED':
            return 'eliminada';
        default:
            return 'sin_responder';
    }
}

/**
 * Mercado Libre NO expone el teléfono ni el email de quien pregunta: lo máximo
 * que da la API es el nickname del perfil. Por eso `nombreContacto` es un
 * apodo, no un contacto: los datos reales sólo llegan si el interesado los
 * escribe en el texto de la pregunta (por eso `registrarPreguntaComoLead`
 * recibe teléfono/email a mano).
 */
const nicknames = new Map<string, string>();

async function nicknameDeUsuario(cuentaId: number, mlUserId: string | null): Promise<string | null> {
    if (!mlUserId) return null;
    const cacheado = nicknames.get(mlUserId);
    if (cacheado) return cacheado;
    try {
        const usuario = await llamarApi<{ nickname?: string }>(cuentaId, `/users/${mlUserId}`);
        const nick = typeof usuario?.nickname === 'string' ? usuario.nickname.trim() : '';
        if (!nick) return null;
        // Cache acotado: un mismo interesado pregunta varias veces y cada lote
        // son 50 perfiles; sin tope el Map crecería para siempre en el worker.
        if (nicknames.size >= MAX_NICKNAMES) nicknames.clear();
        nicknames.set(mlUserId, nick);
        return nick;
    } catch (err) {
        // Un perfil inaccesible (usuario dado de baja, permisos) no puede
        // frenar la ingesta de la pregunta: el nombre es decorativo.
        logger.debug(`[meli-preguntas] no se pudo leer el perfil ${mlUserId}: ${mensajeCorto(err)}`);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingesta (worker y webhook, sin request)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resuelve la cuenta de la que se va a ingestar.
 *
 * Con contexto de request va por `prisma`: la extensión scopea al tenant, así
 * que un `cuentaId` de otra concesionaria simplemente no se encuentra. Sin
 * contexto (worker) hay que ir por el bypass — bajo `app_rw` la policy exige
 * `app.tenant_id` y sin ella el findFirst devuelve null SIEMPRE, en silencio.
 */
async function resolverCuenta(cuentaId: number): Promise<MercadoLibreCuenta> {
    const cuenta = context.getTenantId()
        ? await prisma.mercadoLibreCuenta.findFirst({ where: { id: cuentaId } })
        : await withAuthBypass((tx) => tx.mercadoLibreCuenta.findFirst({
            where: { id: cuentaId, deletedAt: null },
        }));
    if (!cuenta) throw new NotFoundException('Cuenta de Mercado Libre');
    return cuenta;
}

/**
 * Guarda una pregunta de ML. Devuelve `true` si la fila se creó (sirve para
 * contar las nuevas de la corrida).
 *
 * Idempotente por diseño: `mlQuestionId` es unique y el upsert reentra sin
 * duplicar. En el camino de UPDATE se pisa sólo lo que manda Mercado Libre
 * (texto, estado, respuesta); `asignadoAId`, `clienteId` y `respondidaPorId`
 * son decisiones NUESTRAS y sobreviven a cada resincronización.
 */
async function upsertPregunta(cuenta: MercadoLibreCuenta, q: PreguntaApiMl): Promise<boolean> {
    const mlQuestionId = q.id != null ? String(q.id) : '';
    const itemId = q.item_id ? String(q.item_id) : '';
    if (!mlQuestionId || !itemId) return false;

    // Enlace con la publicación propia, si el ítem es uno que publicamos
    // nosotros. Puede no existir: la cuenta pudo tener ítems cargados desde la
    // web de ML y la pregunta igual vale como consulta.
    const publicacion = await prisma.publicacionMl.findFirst({
        where: { itemId },
        select: { id: true },
    });

    const existente = await prisma.preguntaMl.findFirst({
        where: { mlQuestionId },
        select: { id: true, nombreContacto: true, respondidaPorId: true },
    });

    const estadoMl = mapearEstado(q.status);
    // Una pregunta que YA contestamos desde el sistema no vuelve a
    // 'sin_responder' aunque el índice de /questions/search todavía la liste
    // así (tarda en reflejar la respuesta): la bandeja mostraría trabajo hecho.
    const estado = existente?.respondidaPorId && estadoMl === 'sin_responder' ? undefined : estadoMl;

    const respuesta = typeof q.answer?.text === 'string' ? q.answer.text : null;
    const respondidaEn = q.answer?.date_created ? new Date(q.answer.date_created) : null;
    const preguntadaEn = q.date_created ? new Date(q.date_created) : new Date();
    const mlFromUserId = q.from?.id != null ? String(q.from.id) : null;
    const texto = (q.text ?? '').trim();

    // El nickname se pide UNA sola vez, al dar de alta la pregunta: es una
    // llamada extra a la API por cada interesado nuevo y el apodo no cambia.
    const nombreContacto = existente
        ? existente.nombreContacto
        : (q.from?.nickname?.trim() || await nicknameDeUsuario(cuenta.id, mlFromUserId));

    await prisma.preguntaMl.upsert({
        // El unique es POR TENANT: con uno global, una pregunta que ya vivía en
        // otra concesionaria (misma cuenta de ML re-vinculada, tenant de demo
        // migrado al real) hacía que este upsert —que va scopeado— no matcheara,
        // cayera en el create y reventara con un P2002 contra una fila invisible.
        where: { concesionariaId_mlQuestionId: { concesionariaId: cuenta.concesionariaId, mlQuestionId } },
        create: {
            // concesionariaId lo inyecta la extensión desde el contexto.
            cuentaId: cuenta.id,
            publicacionId: publicacion?.id ?? null,
            mlQuestionId,
            itemId,
            mlFromUserId,
            nombreContacto,
            texto,
            respuesta,
            estado: estadoMl,
            preguntadaEn,
            respondidaEn,
        } as never,
        update: {
            // La publicación puede haberse creado DESPUÉS de la pregunta
            // (item publicado, pregunta ingerida antes del enlace): se
            // completa cuando aparece, nunca se borra.
            ...(publicacion ? { publicacionId: publicacion.id } : {}),
            ...(estado ? { estado } : {}),
            ...(texto ? { texto } : {}),
            // Espeja una respuesta escrita desde la app de Mercado Libre: si
            // no pasó por nosotros, `respondidaPorId` queda en null a propósito.
            ...(respuesta ? { respuesta, respondidaEn: respondidaEn ?? new Date() } : {}),
        },
    });

    return existente === null;
}

/**
 * Una página de `/questions/search`; devuelve cuántas filas se crearon y cuántas
 * quedaron afuera por error. Las fallidas se CUENTAN y suben: tragarlas dejaba
 * la bandeja vacía mientras la cuenta mostraba "todo bien" en Configuración.
 */
async function ingestarPagina(
    cuenta: MercadoLibreCuenta,
    status: 'UNANSWERED' | 'ANSWERED',
    offset: number,
): Promise<{ nuevas: number; devueltas: number; fallidas: number }> {
    const busqueda = await llamarApi<BusquedaPreguntasMl>(cuenta.id, '/questions/search', {
        query: {
            seller_id: cuenta.mlUserId,
            status,
            limit: LIMITE_BUSQUEDA,
            offset,
            // api_version 4 es la que trae `from` y `answer` embebidos; sin
            // ella la respuesta viene en el formato viejo y `answer` falta.
            api_version: 4,
            // Más nuevas primero: si hay backlog, lo primero que entra es lo
            // que el vendedor tiene que contestar ya.
            sort_fields: 'date_created',
            sort_types: 'DESC',
        },
    });

    const preguntas = Array.isArray(busqueda?.questions) ? busqueda.questions : [];
    let nuevas = 0;
    let fallidas = 0;
    for (const q of preguntas) {
        try {
            if (await upsertPregunta(cuenta, q)) nuevas += 1;
        } catch (err) {
            // Una pregunta podrida no corta el lote, pero se cuenta: si todas
            // fallan, la bandeja se queda vacía y eso TIENE que verse.
            fallidas += 1;
            logger.error(`[meli-preguntas] cuenta ${cuenta.id} · pregunta ${q?.id}: ${mensajeCorto(err)}`);
        }
    }
    return { nuevas, devueltas: preguntas.length, fallidas };
}

/**
 * Trae las preguntas de la cuenta y las persiste. Dos pasadas:
 *  - SIN RESPONDER, paginada: es la cola de trabajo real.
 *  - RESPONDIDAS recientes, una sola página: espeja las respuestas que el
 *    vendedor escribió desde la app de Mercado Libre, para que la bandeja no
 *    le muestre como pendiente algo que ya contestó desde el celular.
 */
export async function ingestarPreguntasDeCuenta(cuentaId: number): Promise<{ nuevas: number; fallidas: number }> {
    const cuenta = await resolverCuenta(cuentaId);

    // Todo el trabajo va bajo el tenant dueño de la cuenta: la extensión
    // inyecta concesionariaId en el upsert y setea las GUC de RLS. Sin esto,
    // llamado desde el worker, cada consulta vería 0 filas.
    return conContextoSistema(cuenta.concesionariaId, async () => {
        let nuevas = 0;
        let fallidas = 0;

        for (let pagina = 0; pagina < PAGINAS_SIN_RESPONDER; pagina += 1) {
            const p = await ingestarPagina(cuenta, 'UNANSWERED', pagina * LIMITE_BUSQUEDA);
            nuevas += p.nuevas;
            fallidas += p.fallidas;
            // Página incompleta = no hay más; evita pedir offsets vacíos.
            if (p.devueltas < LIMITE_BUSQUEDA) break;
        }

        try {
            const p = await ingestarPagina(cuenta, 'ANSWERED', 0);
            nuevas += p.nuevas;
            fallidas += p.fallidas;
        } catch (err) {
            // El espejo de respuestas es secundario: si falla, las sin
            // responder ya entraron y eso es lo que hace falta para trabajar.
            logger.error(`[meli-preguntas] cuenta ${cuenta.id}: no se pudieron espejar las respondidas: ${mensajeCorto(err)}`);
        }

        if (nuevas > 0) {
            logger.info(`[meli-preguntas] cuenta ${cuenta.id}: ${nuevas} pregunta(s) nueva(s)`);
        }
        return { nuevas, fallidas };
    });
}

/**
 * Cuenta vinculada por `user_id` de Mercado Libre, buscada A CIEGAS en todos
 * los tenants.
 *
 * VA POR withAuthBypass, no por `prisma` ni por `rawPrisma` pelado: la
 * notificación llega sin JWT, así que no hay tenant en el contexto, y el
 * runtime se conecta como `app_rw` (sin BYPASSRLS). Sin las GUC, la policy
 * tenant_iso devuelve CERO filas EN SILENCIO: el webhook respondería 200 a
 * todas las notificaciones sin ingerir nada y sin un solo error visible.
 * `activa` y `deletedAt` van a mano porque el `tx` no pasa por la extensión.
 */
async function buscarCuentaPorMlUserId(mlUserId: string): Promise<MercadoLibreCuenta | null> {
    if (!mlUserId) return null;
    const cuentas = await withAuthBypass((tx) => tx.mercadoLibreCuenta.findMany({
        where: { mlUserId, activa: true, deletedAt: null },
        orderBy: { id: 'asc' },
        take: 2,
    }));
    // La vinculación rechaza que la misma cuenta de ML quede activa en dos
    // concesionarias, justamente porque acá no habría forma de saber a cuál va
    // la notificación. Si aparece igual (datos previos a esa guarda), elegir en
    // silencio significa escribir las consultas de un vendedor en el CRM de otra
    // concesionaria: se avisa fuerte en vez de repartir por id.
    if (cuentas.length > 1) {
        logger.error(`[meli-webhook] el user_id ${mlUserId} está vinculado y activo en más de una concesionaria: hay que desvincularlo de todas menos una para que las preguntas entren donde corresponde`);
    }
    return cuentas[0] ?? null;
}

/**
 * Presupuesto de notificaciones por cuenta y por minuto.
 *
 * La ruta del webhook es PÚBLICA y sin firma (ML no firma el cuerpo), así que
 * cualquiera desde internet puede dispararla en bucle eligiendo el `user_id`. Y
 * la cuota de la API de Mercado Libre es POR APLICACIÓN, no por vendedor: el
 * gasto forzado contra un solo tenant degrada la sincronización de TODOS. Un
 * límite por IP no alcanza (se rota la IP); esto acota lo que una cuenta puede
 * hacernos gastar, que es la magnitud que importa. Lo que se descarte lo levanta
 * igual el worker en su próxima pasada.
 */
const VENTANA_PRESUPUESTO_MS = 60 * 1000;
const NOTIFICACIONES_POR_MINUTO = 60;
const presupuestoPorCuenta = new Map<number, { desde: number; usadas: number }>();

function hayPresupuesto(cuentaId: number): boolean {
    const ahora = Date.now();
    const actual = presupuestoPorCuenta.get(cuentaId);
    if (!actual || ahora - actual.desde >= VENTANA_PRESUPUESTO_MS) {
        presupuestoPorCuenta.set(cuentaId, { desde: ahora, usadas: 1 });
        return true;
    }
    actual.usadas += 1;
    return actual.usadas <= NOTIFICACIONES_POR_MINUTO;
}

/** Último segmento de un resource de ML ('/questions/123' → '123'). */
const idDeResource = (resource: string): string =>
    String(resource ?? '').split('?')[0].split('/').filter(Boolean).pop() ?? '';

/** Trae UNA pregunta por su resource y la persiste. */
async function ingestarPreguntaPorResource(cuenta: MercadoLibreCuenta, resource: string): Promise<void> {
    const questionId = idDeResource(resource);
    if (!questionId) return;
    const pregunta = await llamarApi<PreguntaApiMl>(cuenta.id, `/questions/${questionId}`, {
        query: { api_version: 4 },
    });
    // El `resource` lo elige quien manda la notificación, y la ruta es pública:
    // sin este chequeo, un tercero podía hacer que trajéramos CUALQUIER pregunta
    // y la escribiéramos en la bandeja de la concesionaria que él eligiera. Lo
    // único que ata la pregunta a esta cuenta es su vendedor.
    const vendedor = pregunta?.seller_id != null ? String(pregunta.seller_id) : null;
    if (vendedor !== null && vendedor !== cuenta.mlUserId) {
        logger.warn(`[meli-webhook] la pregunta ${questionId} es del vendedor ${vendedor}, no de la cuenta ${cuenta.id} (${cuenta.mlUserId}): se descarta`);
        return;
    }
    await upsertPregunta(cuenta, pregunta);
}

/** Sincroniza la publicación propia que corresponde al ítem notificado. */
async function sincronizarPorResourceDeItem(resource: string): Promise<void> {
    const itemId = idDeResource(resource);
    if (!itemId) return;
    const publicacion = await prisma.publicacionMl.findFirst({
        where: { itemId },
        select: { id: true },
    });
    // Un ítem que no publicamos nosotros no es un error: la app puede estar
    // suscripta a toda la cuenta y el vendedor tener stock cargado a mano.
    // (El findFirst va scopeado al tenant, así que un itemId ajeno no matchea:
    // ahí está la validación de pertenencia de este topic.)
    if (!publicacion) return;
    // Reconciliación completa, no sólo espejo: si el aviso quedó desincronizado
    // (precio viejo, activo con el auto ya vendido) esta es la oportunidad de
    // repararlo. Espejar y nada más borraba el `ultimoError` del empuje fallido.
    await reconciliarPublicacion(publicacion.id);
}

/**
 * Procesa una notificación del webhook público de Mercado Libre.
 *
 * NUNCA tira: la ruta ya respondió 200 (ML reintenta ante no-200 y corta los
 * webhooks lentos, así que el procesamiento corre en background) y un throw
 * acá terminaría en un unhandled rejection.
 */
export async function procesarNotificacionMl(n: {
    topic: string;
    resource: string;
    userId: string;
    applicationId?: string;
}): Promise<void> {
    const topic = String(n?.topic ?? '');
    try {
        if (topic !== 'questions' && topic !== 'items') {
            // ML manda muchos topics a los que uno queda suscripto sin querer
            // (orders, messages, shipments): no son un error, son ruido.
            logger.debug(`[meli-webhook] topic ignorado: ${topic || '(vacío)'}`);
            return;
        }

        // La ruta es pública: si la notificación dice venir de otra aplicación
        // no es nuestra y no hay que gastarle llamadas a la API. El
        // applicationId se EXIGE (antes, omitirlo salteaba el filtro entero).
        const appId = process.env.ML_CLIENT_ID;
        if (appId && String(n.applicationId ?? '') !== appId) {
            logger.warn(`[meli-webhook] notificación de otra aplicación (${n.applicationId ?? 'sin application_id'}), se ignora`);
            return;
        }

        const cuenta = await buscarCuentaPorMlUserId(String(n?.userId ?? ''));
        if (!cuenta) {
            logger.warn(`[meli-webhook] no hay cuenta vinculada para el user_id ${n?.userId}`);
            return;
        }

        // El presupuesto se cobra ANTES de salir a la API de ML, que es el
        // recurso compartido entre todos los tenants.
        if (!hayPresupuesto(cuenta.id)) {
            logger.warn(`[meli-webhook] cuenta ${cuenta.id}: más de ${NOTIFICACIONES_POR_MINUTO} notificaciones en un minuto, se descarta (el worker levanta lo que falte)`);
            return;
        }

        // Recién acá se sabe el tenant: de este punto para adelante todo va
        // con el contexto sintético de la concesionaria dueña de la cuenta.
        await conContextoSistema(cuenta.concesionariaId, async () => {
            if (topic === 'questions') {
                await ingestarPreguntaPorResource(cuenta, n.resource);
            } else {
                await sincronizarPorResourceDeItem(n.resource);
            }
        });
    } catch (err) {
        logger.error(`[meli-webhook] topic ${topic} · resource ${n?.resource}: ${mensajeCorto(err)}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bandeja (requests del panel)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contesta la pregunta en Mercado Libre y recién después la marca respondida
 * localmente: si ML rechaza, la fila queda intacta y el usuario ve el motivo.
 */
export async function responderPregunta(preguntaId: number, texto: string, usuarioId: number): Promise<PreguntaMl> {
    // ML corta en 2000: recortar acá evita un 400 de la API por longitud.
    const limpio = (texto ?? '').trim().slice(0, LIMITE_RESPUESTA);
    if (!limpio) {
        throw new BaseException(400, 'La respuesta no puede estar vacía', 'RESPUESTA_VACIA');
    }

    const pregunta = await prisma.preguntaMl.findFirst({
        where: { id: preguntaId },
        include: { cuenta: { select: { modo: true } } },
    });
    if (!pregunta) throw new NotFoundException('Pregunta');
    assertPuedeAtender(pregunta.asignadoAId);
    // Los dos rechazos de abajo son reglas de Mercado Libre, y sobre una pregunta
    // SIMULADA decirlo sería afirmar algo falso: no hay nada allá que las imponga.
    // El usuario ve estos mensajes delante de un comprador (alcanza con apretar
    // "Responder" dos veces), así que el texto tiene que decir quién rechazó.
    const simulada = esPreguntaSimulada(pregunta);
    if (pregunta.estado === 'eliminada') {
        throw new BaseException(
            409,
            simulada
                ? 'La pregunta simulada quedó marcada como eliminada y ya no se puede responder.'
                : 'La pregunta ya no se puede responder en Mercado Libre',
            'PREGUNTA_ELIMINADA',
        );
    }
    // Mercado Libre admite UNA sola respuesta por pregunta. Antes el invariante lo
    // imponía sólo el upstream (el segundo POST /answers rebotaba) y el front, que
    // deshabilita el composer: dos pestañas abiertas —o cualquier llamada directa a
    // la API— pisaban la respuesta y el autor sin un solo error. En modo
    // demostración era peor: el simulador ES la plataforma, así que aceptaba la
    // segunda y la demo quedaba siendo más permisiva que la plataforma que dice
    // reproducir (y que la propia pantalla afirma que sólo admite una).
    if (pregunta.estado === 'respondida') {
        throw new BaseException(
            409,
            simulada
                ? 'La pregunta simulada ya fue respondida. El simulador reproduce la regla de Mercado Libre, que admite una sola respuesta por pregunta.'
                : 'La pregunta ya fue respondida: Mercado Libre admite una sola respuesta por pregunta.',
            'PREGUNTA_YA_RESPONDIDA',
        );
    }

    // La MeliError sube tal cual (con el mensaje de ML y sus `cause`): los
    // rechazos típicos —ítem dado de baja, pregunta cerrada, texto con datos de
    // contacto— sólo se entienden leyendo el motivo original.
    const questionId = Number(pregunta.mlQuestionId);
    await llamarApi(pregunta.cuentaId, '/answers', {
        method: 'POST',
        body: {
            question_id: Number.isFinite(questionId) ? questionId : pregunta.mlQuestionId,
            text: limpio,
        },
    });

    return prisma.preguntaMl.update({
        where: { id: preguntaId },
        data: {
            estado: 'respondida',
            respuesta: limpio,
            respondidaEn: new Date(),
            respondidaPorId: usuarioId,
        },
    });
}

/** Asigna (o libera, con null) la pregunta a un vendedor del tenant. */
export async function asignarPregunta(preguntaId: number, usuarioId: number | null): Promise<PreguntaMl> {
    const pregunta = await prisma.preguntaMl.findFirst({
        where: { id: preguntaId },
        select: { id: true },
    });
    if (!pregunta) throw new NotFoundException('Pregunta');

    if (usuarioId != null) {
        // La extensión scopea el findFirst al tenant, así que un id de otra
        // concesionaria cae acá como 404 y no como una asignación cruzada.
        const usuario = await prisma.usuario.findFirst({
            where: { id: usuarioId, activo: true },
            select: { id: true },
        });
        if (!usuario) throw new NotFoundException('Usuario');
    }

    return prisma.preguntaMl.update({
        where: { id: preguntaId },
        data: { asignadoAId: usuarioId },
    });
}

/** Ids que emite el modo demostración: se distinguen a simple vista de un MLA real. */
const ID_SIMULADO_ML = /^DEMO-/i;

/**
 * Si la pregunta la fabricó el modo demostración. El modo de la cuenta manda; los
 * ids `DEMO-` lo confirman fila por fila, porque una pregunta sembrada sigue
 * siendo simulada aunque después se vincule una cuenta real.
 */
const esPreguntaSimulada = (p: {
    mlQuestionId?: string | null;
    itemId?: string | null;
    cuenta?: { modo: string } | null;
}): boolean =>
    p.cuenta?.modo === 'demo'
    || ID_SIMULADO_ML.test(p.mlQuestionId ?? '')
    || ID_SIMULADO_ML.test(p.itemId ?? '');

/**
 * Convierte la pregunta en un lead del CRM (ingesta común de consultas).
 *
 * OJO con el dedupe: `ingestarConsulta` deduplica por teléfono o email, y
 * Mercado Libre NO da ninguno de los dos (ver `nicknameDeUsuario`). Si el
 * usuario no carga el contacto a mano en `datos`, no hay con qué matchear y
 * cada registro crea un cliente nuevo. Por eso la UI pide esos campos: son la
 * única forma de que dos consultas del mismo interesado caigan en una ficha.
 *
 * Este es el ÚNICO punto por el que algo simulado sale de la simulación: el
 * cliente que se crea acá sobrevive a "Salir del modo demostración" (ya es un
 * dato del CRM). Por eso la marca de simulación viaja con la consulta: sin ella
 * una pregunta que fabricó el sistema terminaba como una ficha indistinguible
 * de un interesado real, contada en el reporte de leads por origen.
 */
export async function registrarPreguntaComoLead(
    preguntaId: number,
    datos: { nombre?: string; telefono?: string; email?: string; vendedorId?: number | null },
): Promise<{ clienteId: number; creado: boolean; simulada: boolean; sobreFichaReal: boolean }> {
    const pregunta = await prisma.preguntaMl.findFirst({
        where: { id: preguntaId },
        select: {
            id: true,
            texto: true,
            nombreContacto: true,
            asignadoAId: true,
            clienteId: true,
            mlQuestionId: true,
            itemId: true,
            publicacion: { select: { vehiculoId: true } },
            // El modo de la cuenta es la fuente de verdad del rótulo; los ids
            // DEMO- lo confirman fila por fila (una pregunta sembrada sigue
            // siendo simulada aunque después se vincule una cuenta real).
            cuenta: { select: { modo: true } },
        },
    });
    if (!pregunta) throw new NotFoundException('Pregunta');
    assertPuedeAtender(pregunta.asignadoAId);

    const simulada = esPreguntaSimulada(pregunta);

    // Idempotente: una pregunta ya convertida devuelve SU cliente. Sin esto,
    // dos vendedores mirando la misma pregunta sin asignar (o un reintento tras
    // un timeout) creaban una ficha nueva cada vez — ML no da teléfono ni email,
    // así que el dedupe de `ingestarConsulta` no tiene con qué matchear y cae
    // siempre en el create. El lead viejo quedaba huérfano y desbalanceaba el
    // round-robin.
    if (pregunta.clienteId != null) {
        return { clienteId: pregunta.clienteId, creado: false, simulada, sobreFichaReal: false };
    }

    const resultado = await ingestarConsulta({
        origen: 'mercadolibre',
        nombre: datos.nombre?.trim() || pregunta.nombreContacto || 'Consulta de Mercado Libre',
        telefono: datos.telefono ?? null,
        email: datos.email ?? null,
        texto: pregunta.texto,
        // Rótulo de punta a punta: marca la ficha nueva y deja escrito en las
        // observaciones que la consulta la generó el modo demostración, en vez de
        // afirmar que llegó por Mercado Libre.
        simulada,
        // Si la pregunta está enlazada a una publicación nuestra, el interés
        // por ese vehículo queda registrado solo.
        vehiculoId: pregunta.publicacion?.vehiculoId ?? null,
        // El que la venía atendiendo se queda con el lead; si no hay nadie,
        // la ingesta lo reparte por round-robin.
        vendedorId: datos.vendedorId ?? pregunta.asignadoAId,
    });

    if (pregunta.clienteId !== resultado.clienteId) {
        await prisma.preguntaMl.update({
            where: { id: preguntaId },
            data: { clienteId: resultado.clienteId },
        });
    }
    logger.info(`[meli-preguntas] pregunta ${preguntaId} registrada como consulta (cliente ${resultado.clienteId})${simulada ? ' [SIMULADA]' : ''}`);

    // `sobreFichaReal`: la pregunta simulada cayó, por el teléfono o el mail que
    // cargó el operador, sobre un cliente de VERDAD. Ahí la ingesta sólo le anota
    // la línea rotulada en observaciones; el aviso de la pantalla lo dice.
    return { clienteId: resultado.clienteId, creado: resultado.creado, simulada, sobreFichaReal: resultado.sobreFichaReal };
}

export interface FiltroPreguntas {
    estado?: string;
    asignadoAId?: number;
    soloMias?: boolean;
    usuarioId?: number;
    page?: number;
    limit?: number;
}

/**
 * Listado paginado de la bandeja: primero lo que falta contestar, después por
 * fecha de pregunta descendente.
 */
export async function listarPreguntas(
    f: FiltroPreguntas,
): Promise<{ results: unknown[]; total: number; page: number; limit: number }> {
    const page = entero(f?.page) ?? 1;
    const limit = Math.min(entero(f?.limit) ?? 20, 100);

    const where: Prisma.PreguntaMlWhereInput = {};
    // Whitelist contra el enum: un ?estado arbitrario reventaría Prisma con un
    // PrismaClientValidationError (500), igual que en los otros listados.
    if (f?.estado && ESTADOS_PREGUNTA.includes(String(f.estado))) {
        where.estado = String(f.estado) as EstadoPreguntaMl;
    }
    const asignadoAId = entero(f?.asignadoAId);
    if (asignadoAId) where.asignadoAId = asignadoAId;

    // Gating de visibilidad: el vendedor puro ve lo suyo y lo que está libre,
    // y cualquiera puede pedir esa vista con soloMias.
    if (f?.soloMias === true || esVendedorPuro()) {
        const usuarioId = entero(f?.usuarioId) ?? context.getUser()?.userId ?? 0;
        where.AND = [{ OR: [{ asignadoAId: usuarioId }, { asignadoAId: null }] }];
    }

    const [results, total] = await Promise.all([
        prisma.preguntaMl.findMany({
            where,
            // El enum se ordena por su ORDEN DE DECLARACIÓN en Postgres
            // (sin_responder < respondida < eliminada), así que 'asc' deja
            // arriba lo pendiente. Desempate por id para que el paginado con
            // LIMIT/OFFSET no repita ni saltee filas.
            orderBy: [{ estado: 'asc' }, { preguntadaEn: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                cuentaId: true,
                publicacionId: true,
                mlQuestionId: true,
                itemId: true,
                nombreContacto: true,
                texto: true,
                respuesta: true,
                estado: true,
                asignadoAId: true,
                clienteId: true,
                preguntadaEn: true,
                respondidaEn: true,
                // Todo esto viaja en la misma query para que la UI no tenga que
                // pedir el vehículo pregunta por pregunta (N+1).
                publicacion: {
                    select: {
                        id: true,
                        itemId: true,
                        permalink: true,
                        titulo: true,
                        vehiculo: { select: { id: true, marca: true, modelo: true, anio: true } },
                    },
                },
                asignadoA: { select: { id: true, nombre: true } },
                respondidaPor: { select: { id: true, nombre: true } },
                cliente: { select: { id: true, nombre: true } },
            },
        }),
        prisma.preguntaMl.count({ where }),
    ]);

    return { results, total, page, limit };
}
