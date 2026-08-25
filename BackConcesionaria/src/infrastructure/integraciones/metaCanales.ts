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
// El evento normalizado y su normalización viven en el DOMINIO (son puros y se
// testean sin base). Se re-exportan acá para no romper a quien ya los importaba
// de este módulo, que es donde estaban.
// ─────────────────────────────────────────────────────────────────────────────

import {
    claveHiloDe,
    fechaDeEntry,
    texto,
    normalizarComentarioFeed,
    normalizarComentarioInstagram,
    normalizarMensajeria,
    type ContextoNotificacion,
    type EventoEntranteMeta,
} from '../../domain/services/metaNormalizacion';

export {
    claveHiloDe,
    fechaDeEntry,
    normalizarComentarioFeed,
    normalizarComentarioInstagram,
    normalizarMensajeria,
};
export type { ContextoNotificacion, EventoEntranteMeta };

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
