import {
    CanalConversacion,
    DireccionMensaje,
    EstadoConversacion,
    EstadoMensajeWhatsapp,
    OrigenLead,
    Prisma,
} from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { withTenantTransaction } from '../../infrastructure/database/unitOfWork';
import { context } from '../../infrastructure/security/context';
import { assertMismoTenant } from '../../infrastructure/security/tenantGuard';
import { BaseException, ForbiddenException, NotFoundException } from '../../domain/exceptions/BaseException';
import { logger } from '../../infrastructure/logging/logger';
import { MensajeEntranteNormalizado } from '../../infrastructure/whatsapp/whatsappClient';
import {
    esCanalDeComentarios,
    esCanalDeMensajeria,
    esCanalMeta,
    estadoVentanaMeta,
} from '../../infrastructure/integraciones/metaEnvio';
import { estadoCanalesMeta, motivoCanalMetaNoConfigurado } from '../../domain/services/canalesMeta';
import { buscarClientePorContacto, conContextoSistema, ingestarConsulta } from './consultaIngest';

/**
 * Bandeja MULTI-CANAL de conversaciones: el lado de DATOS de la atención.
 *
 * Un vendedor atiende CONSULTAS, no canales: WhatsApp, los DM de Instagram y
 * Messenger y los comentarios de Instagram/Facebook viven todos en la misma
 * lista, distinguidos por `Conversacion.canal`. Este módulo es el único que
 * sabe qué significa cada canal; las rutas y el worker se apoyan en él.
 *
 * Dos mundos entran acá:
 *  - Los EVENTOS del socket de WhatsApp (registrarEntrante / marcarActualizacion),
 *    que llegan FUERA de un request: no hay tenant en el AsyncLocalStorage, así
 *    que corren dentro de `conContextoSistema(concesionariaId, ...)` para que la
 *    extensión de Prisma inyecte el tenant y setee las GUC de RLS.
 *  - Los REQUESTS del panel (listar / detalle / encolarSaliente / actualizar /
 *    registrarConsulta), donde el contexto ya viene del JWT. Son multi-canal: es
 *    la MISMA bandeja para los cinco canales, con el canal como etiqueta y filtro.
 *
 * La ENTRADA de Meta no pasa por acá: la escribe la ingesta del webhook
 * (infrastructure/integraciones/metaCanales), que arma la `claveHilo` de sus
 * canales y aplica la ventana de 24 h al recibir. Este módulo es dueño de la
 * clave de WhatsApp, del significado de cada canal y de la SALIDA de todos.
 *
 * La semántica de los canales (qué es un DM, qué es un comentario, cuándo está
 * abierta la ventana de 24 h y cómo se le explica al vendedor) NO se define acá:
 * vive en `infrastructure/integraciones/metaEnvio` y este módulo la re-exporta o
 * la adapta. Una sola implementación es lo que hace que el motivo en criollo sea
 * el MISMO venga por donde venga el rechazo (composer, 409 del encolado o
 * mensaje fallido del worker).
 *
 * El corazón anti-ban vive en `encolarSalienteWhatsapp`: el panel NO envía en el
 * request, sólo deja el mensaje `pendiente` con un `enviarAt` calculado por un
 * slot atómico en SQL. Ese espaciado es EXCLUSIVO de WhatsApp (Baileys es un
 * cliente no oficial y una ráfaga es la forma más rápida de que baneen el
 * número): los canales de Meta salen con `enviarAt = ahora`, porque sus límites
 * son cuotas de la app/página, no un riesgo de ban de la línea.
 */

/** Un mensaje repetido de Baileys choca contra un unique: no es un error real. */
const esConflictoUnico = (err: unknown): boolean =>
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

/**
 * Vendedor "puro": tiene el rol vendedor y NINGUNO de los que ven todo el tenant.
 * Sólo puede ver/atender las conversaciones asignadas a él o sin asignar (mismo
 * criterio que ReporteController).
 */
const esVendedorPuro = (): boolean => {
    const roles = context.getUser()?.roles ?? [];
    return roles.includes('vendedor') && !roles.includes('admin') && !roles.includes('super_admin');
};

/**
 * Filtro de visibilidad del vendedor puro; `null` para quien ve todo el tenant.
 *
 * Es deliberadamente AGNÓSTICO DEL CANAL: se apoya sólo en `asignadoAId`, así
 * que un DM de Instagram sin asignar se comporta igual que un WhatsApp sin
 * asignar (lo ve cualquier vendedor) y uno asignado a otro vendedor queda
 * invisible igual. Multi-canal no cambia ni un permiso.
 */
const filtroVendedor = (): Prisma.ConversacionWhereInput | null => {
    if (!esVendedorPuro()) return null;
    const userId = context.getUser()?.userId ?? 0;
    return { OR: [{ asignadoAId: userId }, { asignadoAId: null }] };
};

// ─────────────────────────────────────────────────────────────────────────────
// Canales: qué es cada uno
// ─────────────────────────────────────────────────────────────────────────────

/** Whitelist para filtros que llegan por query string (anti-500 de Prisma). */
export const CANALES_CONVERSACION: CanalConversacion[] = [
    'whatsapp',
    'instagram',
    'messenger',
    'instagram_comentario',
    'facebook_comentario',
];

/**
 * Qué es cada canal lo define metaEnvio y se re-exporta desde acá.
 *
 * Estaba escrito DOS veces (una lista propia acá y otra allá) y las dos se
 * documentaban como la fuente de verdad. Con una sola implementación, agregar un
 * canal al enum no puede dejar la bandeja y el envío opinando distinto sobre si
 * la respuesta es pública o si hay ventana de 24 h.
 */
export { esCanalMeta, esCanalDeMensajeria };

/** La respuesta se publica a la vista de todos (hay que avisárselo al vendedor). */
export const esCanalComentario = esCanalDeComentarios;

/** Etiqueta corta para logs y mensajes de error (la de la UI la arma el front). */
const nombreCanal = (canal: CanalConversacion): string =>
    ({
        whatsapp: 'WhatsApp',
        instagram: 'Instagram',
        messenger: 'Messenger',
        instagram_comentario: 'un comentario de Instagram',
        facebook_comentario: 'un comentario de Facebook',
    })[canal] ?? canal;

/**
 * Tope de caracteres por canal. NO se puede validar en el schema del body: el
 * canal se conoce recién al leer la conversación.
 *
 * Son los topes que PUBLICA cada plataforma, no un recorte nuestro: nadie trunca
 * el texto antes de llamar a la API — se rechaza entero con un 400 explícito,
 * que es la única forma de que el vendedor se entere. Un mensaje que sale
 * cortado por la mitad es peor: cree que mandó todo.
 *
 * Messenger acepta 2000 (el doble que un DM de Instagram): ponerle 1000 le
 * cortaba a la mitad cualquier explicación de financiación, y además contradecía
 * lo que dicen el schema del body, el OpenAPI y el tipo del front.
 */
const LIMITE_TEXTO: Record<CanalConversacion, number> = {
    whatsapp: 4096,
    instagram: 1000,
    messenger: 2000,
    instagram_comentario: 8000,
    facebook_comentario: 8000,
};

/** Canal → origen del lead, para registrar la conversación como consulta. */
const ORIGEN_POR_CANAL: Record<CanalConversacion, OrigenLead> = {
    whatsapp: 'whatsapp',
    instagram: 'instagram',
    instagram_comentario: 'instagram',
    // Messenger es la mensajería de la PÁGINA de Facebook: el lead es de Facebook.
    messenger: 'facebook',
    facebook_comentario: 'facebook',
};

/**
 * Clave natural del hilo de WHATSAPP, en la columna NOT NULL `claveHilo`.
 *
 * El unique viejo `[whatsappCuentaId, telefono]` no sobrevive a multi-canal: los
 * dos campos pasaron a nullable y en Postgres varios NULL NO chocan entre sí, así
 * que un unique con nullables dejaría pasar hilos duplicados en silencio. El
 * reemplazo es `[concesionariaId, canal, claveHilo]`.
 *
 * El prefijo de CUENTA no es decorativo: una concesionaria puede tener dos
 * números, y hoy el mismo contacto escribiéndole a los dos abre DOS hilos (el
 * unique viejo es por cuenta). Con `claveHilo = telefono` a secas esos dos hilos
 * colisionarían — cambiaría el comportamiento de WhatsApp, que es innegociable, y
 * el CREATE UNIQUE INDEX de la migración fallaría sobre datos de producción que
 * ya tengan ese caso.
 *
 * ESTE FORMATO ESTÁ REPLICADO EN EL BACKFILL de la migración
 * 20260825120000_conversaciones_multicanal (`<cuenta>:<telefono>`). Si cambia
 * acá y no allá, el próximo mensaje de un contacto existente no encuentra su
 * hilo y abre uno nuevo: la bandeja de producción se parte en dos.
 *
 * Los canales de Meta arman su clave en `metaCanales.claveHiloDe` (el id de Meta
 * ya es único por página): la ingesta de Meta es la dueña de esos hilos.
 */
export function claveHiloDe(cuentaId: number, telefono: string): string {
    return `${cuentaId}:${telefono}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// La ventana de 24 h de Meta
// ─────────────────────────────────────────────────────────────────────────────

// El plazo en sí (VENTANA_MENSAJERIA_MS) lo define metaEnvio y lo aplica la
// ingesta al guardar `ventanaVenceAt`. Acá sólo se LEE ese vencimiento: la
// bandeja no recalcula el plazo, para que no haya dos verdades sobre cuándo
// vence una ventana.

/** Estado de la ventana, listo para pintar en el composer. */
export interface EstadoVentana {
    /** false = el canal no tiene ventana (WhatsApp, comentarios). */
    aplica: boolean;
    /** true = se puede escribir ahora. */
    abierta: boolean;
    venceAt: Date | null;
    /** Por qué NO se puede escribir, en criollo. null cuando se puede. */
    motivo: string | null;
}

/**
 * ¿Se puede responder ahora mismo? ADAPTADOR: la regla y el texto viven en
 * `metaEnvio.estadoVentanaMeta`, acá sólo se traducen a la forma que consume la
 * bandeja.
 *
 * Antes esto era una segunda implementación de la misma regla, con el mismo
 * corte pero el motivo REDACTADO DISTINTO. El resultado era que el vendedor
 * podía leer dos explicaciones distintas del mismo rechazo en el mismo chat: la
 * de acá en el composer (pre-chequeo y 409 del encolado) y la de metaEnvio en la
 * burbuja fallida, cuando la ventana vencía mientras el mensaje esperaba en la
 * cola. Peor todavía: cualquier ajuste futuro del plazo se aplicaba en un solo
 * lado y nada lo delataba.
 *
 * La dirección de imports lo permite: metaEnvio es infraestructura y no importa
 * application, así que la regla puede vivir allá y usarse acá sin ciclo.
 */
export function estadoVentana(
    canal: CanalConversacion,
    ventanaVenceAt: Date | null,
    nombreContacto?: string | null,
): EstadoVentana {
    const ventana = estadoVentanaMeta({ canal, ventanaVenceAt, nombreContacto });
    return {
        // Un comentario público se responde cuando sea; lo que sí caduca (7 días)
        // son las respuestas PRIVADAS a un comentario, que no hacemos.
        aplica: esCanalDeMensajeria(canal),
        abierta: ventana.puedeResponder,
        venceAt: ventana.venceAt,
        motivo: ventana.motivo,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eventos del socket de WhatsApp (sin request)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persiste un mensaje que llegó por el socket y mantiene el hilo al día.
 *
 * Idempotente: Baileys reentrega el mismo `waMessageId` (y nuestros propios
 * salientes vuelven con `propio: true` y el id que ya guardamos), así que el
 * choque contra el unique [conversacionId, waMessageId] se traga en silencio.
 */
export async function registrarEntrante(
    cuentaId: number,
    concesionariaId: number,
    msg: MensajeEntranteNormalizado,
): Promise<void> {
    // `propio` = lo mandó el número desde el celular vinculado (alguien contestó
    // por fuera del panel): es un SALIENTE que no pasó por nuestra cola.
    const direccion: DireccionMensaje = msg.propio ? 'saliente' : 'entrante';

    await conContextoSistema(concesionariaId, async () => {
        const conversacion = await obtenerOCrearConversacion(cuentaId, msg);

        // Eco de un mensaje que despachó NUESTRO worker: se adopta la fila que ya
        // existe en vez de crear una nueva (si no, el chat muestra la burbuja
        // duplicada). El hilo ya quedó al día cuando se encoló.
        if (msg.propio && await adoptarSalienteDelPanel(conversacion.id, msg)) return;

        try {
            await prisma.mensajeWhatsapp.create({
                data: {
                    // concesionariaId lo inyecta la extensión desde el contexto.
                    conversacionId: conversacion.id,
                    direccion,
                    tipo: msg.tipo,
                    contenido: msg.contenido,
                    estado: 'recibido',
                    waMessageId: msg.waMessageId,
                    createdAt: msg.fecha,
                } as never,
            });
        } catch (err) {
            // Reentrega de Baileys o eco de un saliente nuestro: el hilo ya está
            // al día, no hay nada que actualizar.
            if (esConflictoUnico(err)) return;
            throw err;
        }

        await prisma.conversacion.update({
            where: { id: conversacion.id },
            data: {
                ultimoMensajeAt: msg.fecha,
                ultimoMensajeDir: direccion,
                // El pushName y el jid recién se conocen con el primer mensaje.
                ...(conversacion.nombreContacto ? {} : { nombreContacto: msg.nombreContacto }),
                ...(conversacion.jid ? {} : { jid: msg.jid }),
                // +1 SÓLO si es entrante (un saliente desde el celular no genera
                // pendientes de lectura; tampoco los descuenta: el operador puede
                // haber contestado sin leer todo el hilo).
                ...(direccion === 'entrante' ? { noLeidos: { increment: 1 } } : {}),
                // Un hilo CERRADO que recibe un mensaje nuevo vuelve a la bandeja
                // (mismo criterio que reabrir un lead ganado/perdido en la ingesta).
                // 'archivada' se respeta: archivar es una decisión explícita.
                ...(direccion === 'entrante' && conversacion.estado === 'cerrada'
                    ? { estado: 'abierta' as EstadoConversacion }
                    : {}),
            },
        });
    });
}

/**
 * Un saliente propio puede ser el ECO de un mensaje que mandó el worker: el
 * socket lo reentrega con `propio: true` unos milisegundos después del envío.
 *
 * Hay dos escritores para esa misma fila y ninguno le gana siempre al otro:
 *   - el worker marca 'enviado' y guarda el waMessageId cuando el socket le
 *     responde;
 *   - este callback llega por el evento, a veces ANTES de esa marca.
 * Si el eco llega primero y creamos una fila nueva, el chat muestra el mensaje
 * dos veces y el worker después choca contra el unique. Adoptando la fila
 * pendiente los dos caminos convergen: el worker termina actualizando la MISMA
 * fila con el mismo id, sin conflicto.
 *
 * El match es acotado a propósito (mismo texto, sin id todavía, en vuelo, últimos
 * 5 minutos): un mensaje escrito desde el celular no matchea nada y se registra
 * normal. Devuelve true si adoptó.
 */
async function adoptarSalienteDelPanel(
    conversacionId: number,
    msg: MensajeEntranteNormalizado,
): Promise<boolean> {
    const VENTANA_MS = 5 * 60 * 1000;
    const pendiente = await prisma.mensajeWhatsapp.findFirst({
        where: {
            conversacionId,
            direccion: 'saliente',
            waMessageId: null,
            estado: { in: ['enviando', 'enviado'] },
            contenido: msg.contenido,
            createdAt: { gte: new Date(Date.now() - VENTANA_MS) },
        },
        // El más viejo primero: con dos mensajes idénticos, cada eco adopta el
        // que le corresponde por orden de envío.
        orderBy: { createdAt: 'asc' },
        select: { id: true },
    });
    if (!pendiente) return false;

    try {
        // Sólo el id: el estado es del worker (él sabe si el envío salió bien).
        await prisma.mensajeWhatsapp.update({
            where: { id: pendiente.id },
            data: { waMessageId: msg.waMessageId },
        });
    } catch (err) {
        // Otro eco se lo llevó primero: igual no hay que crear nada.
        if (!esConflictoUnico(err)) throw err;
    }
    return true;
}

/**
 * Busca el hilo de WhatsApp por su clave natural o lo crea. Si es nuevo, intenta
 * vincularlo a un Cliente existente por teléfono (el mismo dedupe de la ingesta
 * de consultas). Tolera la carrera de dos mensajes simultáneos del mismo contacto.
 *
 * La búsqueda va por [canal, claveHilo] —el unique nuevo— y NO por
 * [whatsappCuentaId, telefono]: el catch de P2002 tiene que releer EXACTAMENTE
 * por la clave que impuso el conflicto, si no la carrera termina en excepción y
 * el mensaje entrante se pierde. Como `claveHilo` de WhatsApp incluye la cuenta,
 * el conjunto de hilos que matchea es idéntico al de antes.
 */
async function obtenerOCrearConversacion(cuentaId: number, msg: MensajeEntranteNormalizado) {
    const claveHilo = claveHiloDe(cuentaId, msg.telefono);
    const buscar = () =>
        prisma.conversacion.findFirst({ where: { canal: 'whatsapp', claveHilo } });

    const existente = await buscar();
    if (existente) return existente;

    const cliente = await buscarClientePorContacto(msg.telefono);
    try {
        return await prisma.conversacion.create({
            data: {
                // concesionariaId lo inyecta la extensión desde el contexto.
                canal: 'whatsapp',
                claveHilo,
                whatsappCuentaId: cuentaId,
                telefono: msg.telefono,
                jid: msg.jid,
                nombreContacto: msg.nombreContacto,
                clienteId: cliente?.id ?? null,
                estado: 'abierta',
                ultimoMensajeAt: msg.fecha,
                ultimoMensajeDir: msg.propio ? 'saliente' : 'entrante',
            } as never,
        });
    } catch (err) {
        // Carrera contra otro mensaje del mismo contacto: el unique la resolvió,
        // nos quedamos con la fila que ganó.
        if (!esConflictoUnico(err)) throw err;
        const ganadora = await buscar();
        if (!ganadora) throw err;
        return ganadora;
    }
}

/**
 * Ack de entrega/lectura de un saliente ya despachado. Nunca degrada el estado:
 * un 'entregado' que llega tarde no pisa un 'leido' (Baileys no garantiza orden).
 *
 * Sigue matcheando por `waMessageId`, que sólo escribe WhatsApp: los ids de Meta
 * viven en la columna `externoId`, así que no hay riesgo de cruce entre canales.
 */
export async function marcarActualizacion(
    concesionariaId: number,
    waMessageId: string,
    estado: 'entregado' | 'leido',
): Promise<void> {
    const previos: EstadoMensajeWhatsapp[] = estado === 'entregado'
        ? ['enviando', 'enviado']
        : ['enviando', 'enviado', 'entregado'];

    await conContextoSistema(concesionariaId, async () => {
        await prisma.mensajeWhatsapp.updateMany({
            where: {
                waMessageId,
                direccion: 'saliente',
                estado: { in: previos },
            },
            data: {
                estado,
                ...(estado === 'entregado' ? { entregadoEn: new Date() } : { leidoEn: new Date() }),
            },
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bandeja (requests del panel)
// ─────────────────────────────────────────────────────────────────────────────

export interface FiltroConversaciones {
    estado?: string;
    /** Un canal de CANALES_CONVERSACION; vacío = todos (la bandeja es una sola). */
    canal?: string;
    asignadoAId?: string | number;
    /** Sólo hilos cuyo último mensaje es del contacto (nadie contestó todavía). */
    sinResponder?: string | boolean;
    q?: string;
    page?: string | number;
    limit?: string | number;
}

const ESTADOS_CONVERSACION = ['abierta', 'cerrada', 'archivada'];

const entero = (valor: unknown): number | null => {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : null;
};

const esVerdadero = (valor: unknown): boolean =>
    valor === true || valor === 'true' || valor === '1';

/** Listado paginado de la bandeja, ordenado por actividad más reciente. */
export async function listar(filtros: FiltroConversaciones) {
    const page = entero(filtros.page) ?? 1;
    const limit = Math.min(entero(filtros.limit) ?? 20, 100);

    const where: Prisma.ConversacionWhereInput = {};
    // Whitelist contra el enum: un ?estado arbitrario reventaría Prisma con un
    // PrismaClientValidationError (500), igual que en los listados de clientes.
    if (filtros.estado && ESTADOS_CONVERSACION.includes(String(filtros.estado))) {
        where.estado = filtros.estado as EstadoConversacion;
    }
    // Mismo criterio para el canal: la bandeja es UNA sola y el filtro es una
    // vista sobre ella, así que un canal inválido se ignora (no vacía la lista).
    if (filtros.canal && CANALES_CONVERSACION.includes(filtros.canal as CanalConversacion)) {
        where.canal = filtros.canal as CanalConversacion;
    }
    const asignadoAId = entero(filtros.asignadoAId);
    if (asignadoAId) where.asignadoAId = asignadoAId;
    if (esVerdadero(filtros.sinResponder)) where.ultimoMensajeDir = 'entrante';

    const and: Prisma.ConversacionWhereInput[] = [];
    const visibilidad = filtroVendedor();
    if (visibilidad) and.push(visibilidad);

    const q = typeof filtros.q === 'string' ? filtros.q.trim() : '';
    if (q) {
        and.push({
            OR: [
                { telefono: { contains: q } },
                { nombreContacto: { contains: q, mode: 'insensitive' } },
                { cliente: { nombre: { contains: q, mode: 'insensitive' } } },
                // Los hilos de Meta no tienen teléfono: el identificador opaco es
                // lo único buscable cuando Meta no nos dio el nombre.
                { contactoExternoId: { contains: q } },
            ],
        });
    }
    if (and.length) where.AND = and;

    const [filas, total] = await Promise.all([
        prisma.conversacion.findMany({
            where,
            orderBy: { ultimoMensajeAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                // El canal es lo que el front convierte en la etiqueta del hilo.
                canal: true,
                telefono: true,
                nombreContacto: true,
                estado: true,
                noLeidos: true,
                ultimoMensajeAt: true,
                ultimoMensajeDir: true,
                ventanaVenceAt: true,
                whatsappCuentaId: true,
                integracionId: true,
                // El MODO de la integración que trajo el hilo, para el rótulo de
                // simulación de cada fila. Va en el listado y no se resuelve en
                // el front porque Ajustes › Integraciones es admin-only: sin
                // esto un vendedor vería la bandeja simulada sin una sola marca.
                integracion: { select: { modo: true } },
                // Los ids del hilo viajan SÓLO para que el rótulo tenga red: el
                // front (`esHiloSimulado`) confirma la simulación por el prefijo
                // DEMO- si algún día `simulado` dejara de llegar. Sin estos
                // campos el chip de la lista dependía de una única fuente y los
                // tres respaldos que el front declara eran inalcanzables.
                claveHilo: true,
                contactoExternoId: true,
                comentarioExternoId: true,
                cliente: { select: { id: true, nombre: true } },
                asignadoA: { select: { id: true, nombre: true } },
                // El include NO hereda el filtro de borrados de la extensión: va
                // a mano (ver cabecera de prisma.extension.ts).
                mensajes: {
                    where: { deletedAt: null },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { contenido: true },
                },
            },
        }),
        prisma.conversacion.count({ where }),
    ]);

    const results = filas.map(({ mensajes, integracion, ...conversacion }) => ({
        ...conversacion,
        // Aplanado como booleano: la fila de la lista no necesita el objeto, y
        // así el rótulo de la lista y el del composer (`envio.simulado`) se
        // llaman igual. Se mira el modo aunque la integración esté desactivada:
        // un hilo que nació simulado sigue siendo simulado.
        simulado: integracion?.modo === 'demo',
        ultimoMensaje: mensajes[0]?.contenido ?? null,
    }));

    return { results, page, limit, totalPages: Math.ceil(total / limit), totalResults: total };
}

/**
 * Todo lo que el composer necesita para decidir si deja escribir, y qué avisar.
 * Va en el detalle para que el vendedor lo vea al ABRIR el hilo, no después de
 * redactar una respuesta larga.
 */
export interface CondicionesEnvio {
    canal: CanalConversacion;
    /** false = el composer se deshabilita y se muestra `motivo` tal cual. */
    puedeEnviar: boolean;
    /** Por qué no se puede escribir, en criollo. null cuando se puede. */
    motivo: string | null;
    /** false en WhatsApp y en comentarios: no hay plazo que mostrar. */
    aplicaVentana: boolean;
    /** Cuándo se cierra la ventana de 24 h (para el contador de la UI). */
    ventanaVenceAt: Date | null;
    /** true = lo que se escriba queda PÚBLICO en la publicación (comentarios). */
    respuestaPublica: boolean;
    limiteCaracteres: number;
    /**
     * true = el hilo entró por una integración en modo DEMOSTRACIÓN: la
     * respuesta se registra adentro del sistema y no se llama a Meta. Se
     * resuelve en el backend (el modo vive en la fila de la integración, y
     * Ajustes › Integraciones es admin-only) para que la bandeja pueda rotular
     * la simulación también para un vendedor.
     */
    simulado: boolean;
}

/** Si el canal de Meta del hilo está en condiciones de responder, y por qué no. */
interface EstadoCanalHilo {
    habilitado: boolean;
    /** Qué falta, redactado para mostrar TAL CUAL. null cuando está todo. */
    motivo: string | null;
    /**
     * La integración que trajo el hilo está en modo demostración: lo que se
     * escriba NO sale a Meta. Viaja hasta el composer porque es el rótulo que
     * distingue lo conectado de lo simulado, y quien mira la bandeja tiene que
     * poder verlo sin buscarlo.
     */
    simulado: boolean;
}

/**
 * ¿La integración que trajo el hilo tiene con qué CONTESTARLO?
 *
 * Recibir y responder piden cosas distintas: un DM de Messenger entra sin que
 * esté cargado el id de la página (la ingesta se cae al `entry.id`), pero la
 * Send API sí lo necesita. Sin este chequeo el hilo aparecía en la bandeja con
 * el composer habilitado, el mensaje se encolaba con 201 y el rechazo aparecía
 * recién en el worker, más de un minuto después, en una burbuja fallida —
 * exactamente lo contrario del principio de "el vendedor ve el rechazo en
 * pantalla, no en un mensaje que nadie mira".
 *
 * Sólo se consulta en los canales de Meta: WhatsApp no pasa por acá.
 */
async function estadoCanalDelHilo(
    canal: CanalConversacion,
    integracionId: number | null,
): Promise<EstadoCanalHilo> {
    if (!integracionId) {
        return {
            habilitado: false,
            motivo: 'A esta conversación le falta el vínculo con la integración de Meta, así que no hay por dónde responder. '
                + 'Va a poder contestarse cuando entre un mensaje nuevo del hilo.',
            simulado: false,
        };
    }

    // La extensión filtra por tenant y por deletedAt: una integración de otra
    // concesionaria no puede matchear ni por accidente.
    const integracion = await prisma.integracionCanal.findFirst({
        where: { id: integracionId, tipo: 'meta', activo: true },
        // `modo` viaja junto al config porque decide las dos cosas de un tirón:
        // si el canal está habilitado (una demo no tiene credenciales que
        // cargar) y si el hilo se rotula como simulado en pantalla.
        select: { config: true, modo: true },
    });
    if (!integracion) {
        return {
            habilitado: false,
            motivo: 'La integración de Meta de esta conversación está desactivada o fue eliminada. '
                + 'Avisale a un administrador para que la revise en Ajustes › Integraciones.',
            simulado: false,
        };
    }

    const simulado = integracion.modo === 'demo';
    // Qué falta lo decide el dominio, que es el mismo que pinta el estado de los
    // canales en Ajustes: el vendedor y el admin leen exactamente lo mismo. En
    // modo demostración los cinco canales salen habilitados —no hay token que
    // cargar—, si no el composer quedaría bloqueado y no habría nada que mostrar.
    const estado = estadoCanalesMeta(integracion.config, integracion.modo).find((c) => c.canal === canal);
    if (!estado || estado.habilitado) return { habilitado: true, motivo: null, simulado };
    return { habilitado: false, motivo: motivoCanalMetaNoConfigurado(estado), simulado };
}

/**
 * Todo lo que el composer necesita, resuelto en el backend: si deja escribir,
 * por qué no, si lo que se escriba va a ser público y cuánto entra. El front no
 * tiene que saber nada de las reglas de Meta para pintar la caja.
 *
 * `canalMeta` es el estado de la integración (lo trae `detalle` con una query;
 * en WhatsApp no aplica y va en null). Va primero en el motivo porque es el
 * problema PERMANENTE: una ventana cerrada se reabre cuando la persona escribe,
 * un token que falta no se arregla solo.
 */
export function condicionesEnvio(
    conversacion: {
        canal: CanalConversacion;
        ventanaVenceAt: Date | null;
        nombreContacto?: string | null;
    },
    canalMeta?: EstadoCanalHilo | null,
): CondicionesEnvio {
    const { canal } = conversacion;
    const ventana = estadoVentana(canal, conversacion.ventanaVenceAt, conversacion.nombreContacto);
    const canalOk = canalMeta ? canalMeta.habilitado : true;
    return {
        canal,
        puedeEnviar: canalOk && ventana.abierta,
        motivo: (canalOk ? null : canalMeta?.motivo ?? null) ?? ventana.motivo,
        aplicaVentana: ventana.aplica,
        ventanaVenceAt: ventana.venceAt,
        respuestaPublica: esCanalComentario(canal),
        limiteCaracteres: LIMITE_TEXTO[canal] ?? 4096,
        // Un hilo de WhatsApp nunca es simulado: WhatsApp se vincula de verdad
        // escaneando el QR, no tiene modo demostración.
        simulado: canalMeta?.simulado === true,
    };
}

/**
 * Hilo completo con sus últimos 100 mensajes en orden cronológico.
 * Efecto lateral: abrir la conversación la marca como leída (noLeidos = 0).
 */
export async function detalle(id: number) {
    const conversacion = await prisma.conversacion.findFirst({
        where: { id },
        select: {
            id: true,
            concesionariaId: true,
            canal: true,
            whatsappCuentaId: true,
            integracionId: true,
            telefono: true,
            jid: true,
            // Igual que en el listado: el front lo usa como respaldo del rótulo
            // de simulación (la clave lleva adentro el id DEMO- del contacto).
            claveHilo: true,
            contactoExternoId: true,
            postExternoId: true,
            comentarioExternoId: true,
            ventanaVenceAt: true,
            nombreContacto: true,
            estado: true,
            noLeidos: true,
            asignadoAId: true,
            clienteId: true,
            ultimoMensajeAt: true,
            ultimoMensajeDir: true,
            createdAt: true,
            // El front lo declara obligatorio en ConversacionDetalle y hasta
            // ahora llegaba undefined.
            updatedAt: true,
            cliente: { select: { id: true, nombre: true } },
            asignadoA: { select: { id: true, nombre: true } },
        },
    });
    if (!conversacion) throw new NotFoundException('Conversación');
    assertPuedeAtender(conversacion.asignadoAId);

    // Últimos 100 (desc + reverse): traer el hilo entero no escala.
    const mensajes = await prisma.mensajeWhatsapp.findMany({
        where: { conversacionId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
            id: true,
            direccion: true,
            tipo: true,
            contenido: true,
            estado: true,
            createdAt: true,
            // Por qué rebotó el envío, ya redactado para mostrar (el worker
            // traduce el código de Meta y deja el crudo en el log): sin esto un
            // mensaje 'fallido' en el chat no explica nada.
            errorMensaje: true,
            enviadoPor: { select: { id: true, nombre: true } },
        },
    });
    mensajes.reverse();

    if (conversacion.noLeidos > 0) {
        await prisma.conversacion.update({ where: { id }, data: { noLeidos: 0 } });
    }

    // En Meta el composer también depende de lo que la integración tenga
    // cargado: sin esto el vendedor escribía una respuesta larga sobre una
    // integración con la que no se puede contestar.
    const canalMeta = esCanalMeta(conversacion.canal)
        ? await estadoCanalDelHilo(conversacion.canal, conversacion.integracionId)
        : null;

    return {
        ...conversacion,
        noLeidos: 0,
        envio: condicionesEnvio(conversacion, canalMeta),
        mensajes,
    };
}

/** Un vendedor puro sólo atiende lo suyo o lo que está sin asignar. */
function assertPuedeAtender(asignadoAId: number | null): void {
    if (!esVendedorPuro()) return;
    const userId = context.getUser()?.userId ?? 0;
    if (asignadoAId !== null && asignadoAId !== userId) {
        throw new ForbiddenException('La conversación está asignada a otro vendedor');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Envío (encolado; el despacho real es del worker)
// ─────────────────────────────────────────────────────────────────────────────

const numeroEnv = (clave: string, porDefecto: number): number => {
    const n = Number(process.env[clave]);
    return Number.isFinite(n) && n > 0 ? n : porDefecto;
};

/**
 * Gap aleatorio entre envíos del mismo número, en SEGUNDOS.
 *
 * Baileys es un cliente no oficial: una ráfaga de mensajes es la forma más
 * rápida de que Meta banee el número. El gap se sortea (un intervalo fijo también
 * es un patrón detectable) y se triplica si el circuit breaker de salud marcó el
 * número como 'ralentizado'.
 *
 * EXCLUSIVO de WhatsApp: los canales de Meta no pasan por acá (ver
 * `encolarSalienteMeta`), pero WhatsApp lo conserva intacto.
 */
const gapSegundos = (saludEstado: string): number => {
    const min = numeroEnv('WHATSAPP_DELAY_MIN_MS', 5000);
    const max = Math.max(numeroEnv('WHATSAPP_DELAY_MAX_MS', 15000), min);
    const ms = min + Math.random() * (max - min);
    return (saludEstado === 'ralentizado' ? ms * 3 : ms) / 1000;
};

export interface SalienteEncolado {
    id: number;
    estado: EstadoMensajeWhatsapp;
    enviarAt: Date;
}

/**
 * Datos mínimos del hilo para decidir por dónde sale un mensaje. Es un supraconjunto
 * estructural de lo que el módulo de envío de Meta necesita del hilo, así que la
 * fila se le puede pasar tal cual sin acoplar este service a su tipo.
 */
type HiloParaEnvio = {
    id: number;
    concesionariaId: number;
    canal: CanalConversacion;
    whatsappCuentaId: number | null;
    telefono: string | null;
    integracionId: number | null;
    contactoExternoId: string | null;
    comentarioExternoId: string | null;
    nombreContacto: string | null;
    ventanaVenceAt: Date | null;
    asignadoAId: number | null;
};

/**
 * Deja un saliente en la cola. NO envía: el request sólo reserva el turno.
 *
 * La firma pública NO cambia con multi-canal — el front manda texto y el backend
 * sabe por dónde sale — pero la validación y el ritmo sí dependen del canal:
 *   whatsapp → slot anti-ban de la cuenta (`enviarAt` en el futuro).
 *   Meta     → ventana de 24 h validada ACÁ (409 en criollo) y `enviarAt = ahora`.
 */
export async function encolarSaliente(
    conversacionId: number,
    contenido: string,
    usuarioId: number | null,
): Promise<SalienteEncolado> {
    const conversacion = await prisma.conversacion.findFirst({
        where: { id: conversacionId },
        select: {
            id: true,
            concesionariaId: true,
            canal: true,
            whatsappCuentaId: true,
            telefono: true,
            integracionId: true,
            contactoExternoId: true,
            comentarioExternoId: true,
            nombreContacto: true,
            ventanaVenceAt: true,
            asignadoAId: true,
        },
    });
    if (!conversacion) throw new NotFoundException('Conversación');
    assertPuedeAtender(conversacion.asignadoAId);

    // El tope real es del canal y recién se conoce acá (el schema del body no
    // sabe a qué conversación va). Cortarlo antes de encolar es lo que evita el
    // rechazo críptico del proveedor tres minutos después.
    const limite = LIMITE_TEXTO[conversacion.canal] ?? 4096;
    if (contenido.length > limite) {
        throw new BaseException(
            400,
            `El mensaje no puede superar los ${limite} caracteres en ${nombreCanal(conversacion.canal)}`,
            'MENSAJE_DEMASIADO_LARGO',
        );
    }

    return esCanalMeta(conversacion.canal)
        ? encolarSalienteMeta(conversacion, contenido, usuarioId)
        : encolarSalienteWhatsapp(conversacion, contenido, usuarioId);
}

/**
 * WhatsApp: el turno se toma con UNA sentencia SQL que avanza `proximo_envio_at`
 * de la cuenta y devuelve el valor nuevo. Que sea un único UPDATE ... RETURNING
 * es lo que lo hace atómico: dos encolados concurrentes sobre el mismo número se
 * serializan en el lock de fila y reciben slots distintos. Leer-y-después-escribir
 * los dejaría a ambos con el mismo `enviarAt` (= ráfaga = ban).
 *
 * Este camino es idéntico al de antes de multi-canal, a propósito.
 */
async function encolarSalienteWhatsapp(
    conversacion: HiloParaEnvio,
    contenido: string,
    usuarioId: number | null,
): Promise<SalienteEncolado> {
    // `whatsappCuentaId` pasó a nullable por los canales de Meta; en un hilo de
    // WhatsApp que esté en null los datos están rotos y no hay por dónde enviar.
    if (!conversacion.whatsappCuentaId) throw new NotFoundException('Cuenta de WhatsApp');

    const cuenta = await prisma.whatsappCuenta.findFirst({
        where: { id: conversacion.whatsappCuentaId },
        select: { id: true, activa: true, saludEstado: true, saludMotivo: true },
    });
    if (!cuenta) throw new NotFoundException('Cuenta de WhatsApp');
    if (!cuenta.activa) {
        throw new BaseException(409, 'El número de WhatsApp está desactivado', 'WHATSAPP_CUENTA_INACTIVA');
    }
    if (cuenta.saludEstado === 'pausado') {
        throw new BaseException(
            409,
            `El número está pausado por salud de entrega${cuenta.saludMotivo ? `: ${cuenta.saludMotivo}` : ''}`,
            'WHATSAPP_CUENTA_PAUSADA',
        );
    }

    const gap = gapSegundos(cuenta.saludEstado);
    const tenantId = conversacion.concesionariaId;
    const cuentaId = conversacion.whatsappCuentaId;

    // Unit of Work: el slot y el mensaje commitean juntos. Si el create fallara,
    // el slot avanzado quedaría "gastado" y el número perdería un turno.
    // OJO: `tx` NO pasa por la extensión → concesionariaId y deletedAt van a mano.
    return withTenantTransaction(async (tx) => {
        const filas = await tx.$queryRaw<Array<{ proximo_envio_at: Date }>>(Prisma.sql`
            UPDATE whatsapp_cuentas
            SET proximo_envio_at = GREATEST(now(), COALESCE(proximo_envio_at, now()))
                                   + make_interval(secs => ${gap}::double precision)
            WHERE id = ${cuentaId}
              AND concesionaria_id = ${tenantId}
              AND deleted_at IS NULL
            RETURNING proximo_envio_at`);
        const enviarAt = filas[0]?.proximo_envio_at;
        if (!enviarAt) throw new NotFoundException('Cuenta de WhatsApp');

        const mensaje = await tx.mensajeWhatsapp.create({
            data: {
                concesionariaId: tenantId,
                conversacionId: conversacion.id,
                direccion: 'saliente',
                tipo: 'texto',
                contenido,
                estado: 'pendiente',
                enviadoPorId: usuarioId,
                enviarAt,
            },
        });

        // La bandeja reordena y deja de marcar "sin responder" en cuanto el
        // operador contesta, aunque el worker todavía no haya despachado.
        await tx.conversacion.update({
            where: { id: conversacion.id },
            data: { ultimoMensajeAt: new Date(), ultimoMensajeDir: 'saliente', noLeidos: 0 },
        });

        return { id: mensaje.id, estado: mensaje.estado, enviarAt };
    });
}

/**
 * Meta (DM de Instagram/Messenger y comentarios): sin espaciado anti-ban —los
 * límites de Meta son cuotas de la app/página, no un riesgo de ban del número—,
 * así que `enviarAt = ahora` y el worker lo toma en el tick siguiente.
 *
 * Todo lo que puede impedir el envío se valida ACÁ, antes de que el vendedor se
 * quede esperando: ventana de 24 h, integración viva y destino conocido. Cada
 * caso sale como 409 con un mensaje que la UI muestra tal cual.
 */
async function encolarSalienteMeta(
    conversacion: HiloParaEnvio,
    contenido: string,
    usuarioId: number | null,
): Promise<SalienteEncolado> {
    // Guarda barata contra una fila incompleta: sin destino el mensaje se
    // encolaría para morir en el worker. Es el mismo error de dominio que tira
    // metaEnvio al despachar (409 META_CANAL_NO_CONFIGURADO), sólo que a tiempo.
    const destino = esCanalComentario(conversacion.canal)
        ? conversacion.comentarioExternoId
        : conversacion.contactoExternoId;
    if (!destino) {
        throw new BaseException(
            409,
            'A esta conversación le falta el identificador de Meta, así que no hay a dónde responder. Va a poder contestarse cuando entre un mensaje nuevo del hilo.',
            'META_CANAL_NO_CONFIGURADO',
        );
    }

    // Y la integración tiene que tener con qué responder por ESTE canal (token,
    // id de página, id de la cuenta de IG). El worker lo vuelve a mirar, pero
    // descubrirlo recién allá significaba minutos de "pendiente" y un fallido
    // con un motivo que el vendedor no llega a relacionar con lo que escribió.
    // Mismo orden que `condicionesEnvio`: primero lo que no se arregla solo.
    const canalMeta = await estadoCanalDelHilo(conversacion.canal, conversacion.integracionId);
    if (!canalMeta.habilitado) {
        throw new BaseException(
            409,
            canalMeta.motivo ?? 'El canal de Meta de esta conversación no está configurado',
            'META_CANAL_NO_CONFIGURADO',
        );
    }

    // Después la ventana: es el motivo de rechazo más frecuente y el más
    // frustrante si se descubre tarde. Sale como 409 con el mismo texto que el
    // front ya venía mostrando en el composer, así que el vendedor lee dos veces
    // lo mismo y nunca un código de Meta. metaEnvio la vuelve a chequear justo
    // antes de llamar a la API, porque un mensaje puede vencer en la cola.
    const ventana = estadoVentana(
        conversacion.canal,
        conversacion.ventanaVenceAt,
        conversacion.nombreContacto,
    );
    if (!ventana.abierta) {
        throw new BaseException(
            409,
            ventana.motivo ?? 'La ventana de mensajería de Meta está cerrada',
            'VENTANA_META_CERRADA',
        );
    }

    const tenantId = conversacion.concesionariaId;
    const enviarAt = new Date();

    // Misma Unit of Work que WhatsApp: el mensaje y el reordenamiento del hilo
    // commitean juntos. `tx` NO pasa por la extensión → tenant a mano.
    return withTenantTransaction(async (tx) => {
        const mensaje = await tx.mensajeWhatsapp.create({
            data: {
                concesionariaId: tenantId,
                conversacionId: conversacion.id,
                direccion: 'saliente',
                // PENDIENTE: una respuesta a un comentario no es un mensaje sino
                // una publicación pública, y quedaría mejor guardada con un tipo
                // 'comentario'. Ese valor NO EXISTE hoy: ni en el enum
                // TipoMensajeWhatsapp de Postgres (la migración multicanal no lo
                // toca a propósito) ni en schema.prisma. Sumarlo es primero una
                // migración `ALTER TYPE "TipoMensajeWhatsapp" ADD VALUE
                // 'comentario'` y RECIÉN DESPUÉS declararlo en el schema —
                // al revés, el primer INSERT revienta en producción. Mientras
                // tanto va 'texto'; el canal de la conversación ya alcanza para
                // que la UI sepa que es público.
                tipo: 'texto',
                contenido,
                estado: 'pendiente',
                enviadoPorId: usuarioId,
                enviarAt,
            },
        });

        await tx.conversacion.update({
            where: { id: conversacion.id },
            data: { ultimoMensajeAt: new Date(), ultimoMensajeDir: 'saliente', noLeidos: 0 },
        });

        return { id: mensaje.id, estado: mensaje.estado, enviarAt };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestión del hilo
// ─────────────────────────────────────────────────────────────────────────────

export interface CambiosConversacion {
    estado?: EstadoConversacion;
    asignadoAId?: number | null;
}

/** Cerrar/archivar/reabrir un hilo y asignarlo a un vendedor. */
export async function actualizar(id: number, cambios: CambiosConversacion) {
    const conversacion = await prisma.conversacion.findFirst({
        where: { id },
        select: { id: true, concesionariaId: true, asignadoAId: true },
    });
    if (!conversacion) throw new NotFoundException('Conversación');
    assertPuedeAtender(conversacion.asignadoAId);

    // El asignado tiene que ser un usuario del MISMO tenant: la RLS valida la
    // fila que se escribe, no a dónde apuntan sus FKs (ver tenantGuard).
    if (cambios.asignadoAId != null) {
        await assertMismoTenant('usuario', cambios.asignadoAId, conversacion.concesionariaId);
    }

    return prisma.conversacion.update({
        where: { id },
        data: {
            ...(cambios.estado !== undefined ? { estado: cambios.estado } : {}),
            ...(cambios.asignadoAId !== undefined ? { asignadoAId: cambios.asignadoAId } : {}),
        },
        include: {
            cliente: { select: { id: true, nombre: true } },
            asignadoA: { select: { id: true, nombre: true } },
        },
    });
}

/**
 * Datos que el vendedor completa a mano al registrar la consulta.
 *
 * Existen por los canales de Meta: un DM de Instagram no trae teléfono NUNCA
 * (`telefono: null` es deliberado en la ingesta) y el nombre depende de que el
 * Graph API haya querido devolver el perfil — que es best-effort y falla
 * justamente cuando el permiso todavía no está aprobado. Sin estos campos, el
 * botón daba de alta un cliente llamado "Contacto 17841400123456789", sin
 * teléfono ni email, imposible de deduplicar y de contactar desde el CRM. El
 * dato lo tiene el vendedor delante: lo que faltaba era pedírselo.
 */
export interface DatosConsultaManual {
    nombre?: string | null;
    telefono?: string | null;
}

/** Texto vacío o sólo espacios → null (el vendedor puede dejar el campo en blanco). */
const opcional = (valor?: string | null): string | null => {
    const limpio = typeof valor === 'string' ? valor.trim() : '';
    return limpio || null;
};

/**
 * Convierte el hilo en un lead: reusa la ingesta común (dedupe por teléfono +
 * round-robin) y deja la conversación vinculada al cliente resultante.
 *
 * El origen sale del canal (un DM de Instagram entra como lead de instagram, un
 * comentario de la página como facebook). El nombre y el teléfono salen primero
 * de lo que cargó el vendedor y después de lo que sepa el hilo; el último
 * escalón sigue siendo el id opaco de Meta, que es feo pero es mejor que no
 * registrar el lead.
 *
 * Lo que el vendedor completa se guarda TAMBIÉN en la conversación: así el hilo
 * deja de llamarse "Sin nombre" y el próximo intento de registrarlo puede
 * deduplicar por teléfono en vez de crear otra ficha.
 */
export async function registrarConsulta(id: number, datos: DatosConsultaManual = {}) {
    const conversacion = await prisma.conversacion.findFirst({
        where: { id },
        select: {
            id: true,
            canal: true,
            telefono: true,
            contactoExternoId: true,
            nombreContacto: true,
            asignadoAId: true,
            clienteId: true,
            // El modo de la integración es la fuente de verdad del rótulo: dice
            // si el hilo lo fabricó el modo demostración o si del otro lado hay
            // alguien de verdad.
            integracion: { select: { modo: true } },
        },
    });
    if (!conversacion) throw new NotFoundException('Conversación');
    assertPuedeAtender(conversacion.asignadoAId);

    // Éste es el ÚNICO punto por el que algo simulado sale de la simulación: el
    // cliente que se crea acá sobrevive a "Salir del modo demostración" (ya es
    // una ficha del CRM, con lo que el vendedor le haya cargado a mano). Sin la
    // marca, un hilo que fabricó el sistema terminaba como una ficha
    // indistinguible de un interesado real y contada en el reporte de consultas.
    const simulada = conversacion.integracion?.modo === 'demo';

    const nombreCargado = opcional(datos.nombre);
    const telefonoCargado = opcional(datos.telefono);
    const telefono = telefonoCargado ?? conversacion.telefono;

    // El dedupe de la ingesta es por teléfono o email EXACTOS. Un hilo de Meta
    // no tiene ninguno de los dos, así que una segunda llamada crearía otra
    // ficha del mismo contacto: si ya quedó vinculado, se respeta ese vínculo.
    if (!telefono && conversacion.clienteId) {
        return { clienteId: conversacion.clienteId, creado: false, simulada, sobreFichaReal: false };
    }

    const ultimoEntrante = await prisma.mensajeWhatsapp.findFirst({
        where: { conversacionId: id, direccion: 'entrante' },
        orderBy: { createdAt: 'desc' },
        select: { contenido: true },
    });

    const resultado = await ingestarConsulta({
        origen: ORIGEN_POR_CANAL[conversacion.canal] ?? 'otro',
        nombre: nombreCargado
            ?? conversacion.nombreContacto
            ?? telefono
            ?? (conversacion.contactoExternoId ? `Contacto ${conversacion.contactoExternoId}` : null)
            ?? `Consulta por ${nombreCanal(conversacion.canal)}`,
        telefono,
        texto: ultimoEntrante?.contenido ?? null,
        // Rótulo de punta a punta: marca la ficha nueva (origenSimulado, que la
        // deja fuera de los reportes y con el chip SIMULACIÓN en Clientes) y deja
        // escrito en las observaciones que la consulta la generó la demostración,
        // en vez de afirmar que llegó por Instagram.
        simulada,
    });

    // Lo cargado a mano no pisa lo que ya había: el nombre del hilo puede
    // haberlo corregido otro operador, y el teléfono de un hilo de WhatsApp es
    // parte de su clave natural.
    const cambios: Prisma.ConversacionUncheckedUpdateInput = {
        ...(conversacion.clienteId !== resultado.clienteId ? { clienteId: resultado.clienteId } : {}),
        ...(nombreCargado && !conversacion.nombreContacto ? { nombreContacto: nombreCargado } : {}),
        ...(telefonoCargado && !conversacion.telefono ? { telefono: telefonoCargado } : {}),
    };
    if (Object.keys(cambios).length > 0) {
        await prisma.conversacion.update({ where: { id }, data: cambios });
    }
    logger.info(`[bandeja] conversación ${id} (${conversacion.canal}) registrada como consulta (cliente ${resultado.clienteId})${simulada ? ' [SIMULADA]' : ''}`);

    // `simulada` vuelve al front: es lo que le permite al aviso decir que el
    // lead quedó en Clientes rotulado y que sobrevive a apagar la demostración.
    // `sobreFichaReal` es el caso incómodo: el vendedor cargó a mano un teléfono
    // que ya estaba en el CRM, así que la consulta simulada cayó sobre un cliente
    // de VERDAD. La ingesta no le tocó ni el origen ni el estado del lead —sólo
    // le anotó la línea rotulada—, y el aviso tiene que decir eso en vez de
    // anunciar un alta que no pasó.
    return { clienteId: resultado.clienteId, creado: resultado.creado, simulada, sobreFichaReal: resultado.sobreFichaReal };
}
