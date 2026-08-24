import { DireccionMensaje, EstadoConversacion, EstadoMensajeWhatsapp, Prisma } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { withTenantTransaction } from '../../infrastructure/database/unitOfWork';
import { context } from '../../infrastructure/security/context';
import { assertMismoTenant } from '../../infrastructure/security/tenantGuard';
import { BaseException, ForbiddenException, NotFoundException } from '../../domain/exceptions/BaseException';
import { logger } from '../../infrastructure/logging/logger';
import { MensajeEntranteNormalizado } from '../../infrastructure/whatsapp/whatsappClient';
import { buscarClientePorContacto, conContextoSistema, ingestarConsulta } from './consultaIngest';

/**
 * Bandeja de conversaciones de WhatsApp: el lado de DATOS del canal.
 *
 * Dos mundos entran acá:
 *  - Los EVENTOS del socket (registrarEntrante / marcarActualizacion), que llegan
 *    FUERA de un request: no hay tenant en el AsyncLocalStorage, así que todo
 *    corre dentro de `conContextoSistema(concesionariaId, ...)` para que la
 *    extensión de Prisma inyecte el tenant y setee las GUC de RLS.
 *  - Los REQUESTS del panel (listar / detalle / encolarSaliente / actualizar /
 *    registrarConsulta), donde el contexto ya viene del JWT.
 *
 * El corazón anti-ban vive en `encolarSaliente`: el panel NO envía en el request,
 * sólo deja el mensaje `pendiente` con un `enviarAt` calculado por un slot
 * atómico en SQL. El worker (otro módulo) es el único que habla con el socket.
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

/** Filtro de visibilidad del vendedor puro; `null` para quien ve todo el tenant. */
const filtroVendedor = (): Prisma.ConversacionWhereInput | null => {
    if (!esVendedorPuro()) return null;
    const userId = context.getUser()?.userId ?? 0;
    return { OR: [{ asignadoAId: userId }, { asignadoAId: null }] };
};

// ─────────────────────────────────────────────────────────────────────────────
// Eventos del socket (sin request)
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
 * Busca el hilo por [whatsappCuentaId, telefono] o lo crea. Si es nuevo, intenta
 * vincularlo a un Cliente existente por teléfono (el mismo dedupe de la ingesta
 * de consultas). Tolera la carrera de dos mensajes simultáneos del mismo contacto.
 */
async function obtenerOCrearConversacion(cuentaId: number, msg: MensajeEntranteNormalizado) {
    const existente = await prisma.conversacion.findFirst({
        where: { whatsappCuentaId: cuentaId, telefono: msg.telefono },
    });
    if (existente) return existente;

    const cliente = await buscarClientePorContacto(msg.telefono);
    try {
        return await prisma.conversacion.create({
            data: {
                // concesionariaId lo inyecta la extensión desde el contexto.
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
        const ganadora = await prisma.conversacion.findFirst({
            where: { whatsappCuentaId: cuentaId, telefono: msg.telefono },
        });
        if (!ganadora) throw err;
        return ganadora;
    }
}

/**
 * Ack de entrega/lectura de un saliente ya despachado. Nunca degrada el estado:
 * un 'entregado' que llega tarde no pisa un 'leido' (Baileys no garantiza orden).
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
                telefono: true,
                nombreContacto: true,
                estado: true,
                noLeidos: true,
                ultimoMensajeAt: true,
                ultimoMensajeDir: true,
                whatsappCuentaId: true,
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

    const results = filas.map(({ mensajes, ...conversacion }) => ({
        ...conversacion,
        ultimoMensaje: mensajes[0]?.contenido ?? null,
    }));

    return { results, page, limit, totalPages: Math.ceil(total / limit), totalResults: total };
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
            whatsappCuentaId: true,
            telefono: true,
            jid: true,
            nombreContacto: true,
            estado: true,
            noLeidos: true,
            asignadoAId: true,
            clienteId: true,
            ultimoMensajeAt: true,
            ultimoMensajeDir: true,
            createdAt: true,
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
            enviadoPor: { select: { id: true, nombre: true } },
        },
    });
    mensajes.reverse();

    if (conversacion.noLeidos > 0) {
        await prisma.conversacion.update({ where: { id }, data: { noLeidos: 0 } });
    }

    return { ...conversacion, noLeidos: 0, mensajes };
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
// Envío (encolado anti-ban)
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
 */
const gapSegundos = (saludEstado: string): number => {
    const min = numeroEnv('WHATSAPP_DELAY_MIN_MS', 5000);
    const max = Math.max(numeroEnv('WHATSAPP_DELAY_MAX_MS', 15000), min);
    const ms = min + Math.random() * (max - min);
    return (saludEstado === 'ralentizado' ? ms * 3 : ms) / 1000;
};

/**
 * Deja un saliente en la cola. NO envía: el request sólo reserva el turno.
 *
 * El turno se toma con UNA sentencia SQL que avanza `proximo_envio_at` de la
 * cuenta y devuelve el valor nuevo. Que sea un único UPDATE ... RETURNING es lo
 * que lo hace atómico: dos encolados concurrentes sobre el mismo número se
 * serializan en el lock de fila y reciben slots distintos. Leer-y-después-escribir
 * los dejaría a ambos con el mismo `enviarAt` (= ráfaga = ban).
 */
export async function encolarSaliente(conversacionId: number, contenido: string, usuarioId: number | null) {
    const conversacion = await prisma.conversacion.findFirst({
        where: { id: conversacionId },
        select: { id: true, concesionariaId: true, whatsappCuentaId: true, asignadoAId: true },
    });
    if (!conversacion) throw new NotFoundException('Conversación');
    assertPuedeAtender(conversacion.asignadoAId);

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

    // Unit of Work: el slot y el mensaje commitean juntos. Si el create fallara,
    // el slot avanzado quedaría "gastado" y el número perdería un turno.
    // OJO: `tx` NO pasa por la extensión → concesionariaId y deletedAt van a mano.
    return withTenantTransaction(async (tx) => {
        const filas = await tx.$queryRaw<Array<{ proximo_envio_at: Date }>>(Prisma.sql`
            UPDATE whatsapp_cuentas
            SET proximo_envio_at = GREATEST(now(), COALESCE(proximo_envio_at, now()))
                                   + make_interval(secs => ${gap}::double precision)
            WHERE id = ${conversacion.whatsappCuentaId}
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
 * Convierte el hilo en un lead: reusa la ingesta común (dedupe por teléfono +
 * round-robin) y deja la conversación vinculada al cliente resultante.
 */
export async function registrarConsulta(id: number) {
    const conversacion = await prisma.conversacion.findFirst({
        where: { id },
        select: { id: true, telefono: true, nombreContacto: true, asignadoAId: true, clienteId: true },
    });
    if (!conversacion) throw new NotFoundException('Conversación');
    assertPuedeAtender(conversacion.asignadoAId);

    const ultimoEntrante = await prisma.mensajeWhatsapp.findFirst({
        where: { conversacionId: id, direccion: 'entrante' },
        orderBy: { createdAt: 'desc' },
        select: { contenido: true },
    });

    const resultado = await ingestarConsulta({
        origen: 'whatsapp',
        nombre: conversacion.nombreContacto ?? conversacion.telefono,
        telefono: conversacion.telefono,
        texto: ultimoEntrante?.contenido ?? null,
    });

    if (conversacion.clienteId !== resultado.clienteId) {
        await prisma.conversacion.update({ where: { id }, data: { clienteId: resultado.clienteId } });
    }
    logger.info(`[whatsapp] conversación ${id} registrada como consulta (cliente ${resultado.clienteId})`);

    return { clienteId: resultado.clienteId, creado: resultado.creado };
}
