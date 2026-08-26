import { Prisma, SolicitudPrecioMinimo } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { actorEsAdmin, actorEsVendedorPuro, actorUserId } from '../../infrastructure/security/roles';
import { BaseException, NotFoundException } from '../../domain/exceptions/BaseException';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { assertMismoTenant } from '../../infrastructure/security/tenantGuard';

/**
 * PRECIO MÍNIMO AUTORIZADO — el flujo completo.
 *
 * Decisión del dueño: el piso de venta "REQUIERE AUTORIZACIÓN POR SISTEMA". O sea
 * que NO es un campo más de la ficha que se muestra según el rol: es un permiso
 * puntual, por unidad, con un pedido, un autorizante y una vigencia.
 *
 * Por qué así y no con un simple `authorize('admin')` sobre un campo: el vendedor
 * SÍ tiene que poder llegar al número (lo necesita para cerrar en el mostrador,
 * es literalmente lo que la especificación dice que "el vendedor VE"), pero no de
 * corrido y no para todo el stock. Un booleano por rol da las dos respuestas
 * malas: o nunca lo ve (y no puede vender) o lo ve siempre (y el piso de toda la
 * concesionaria se filtra en un solo `GET /vehiculos`).
 *
 * El flujo mínimo, entonces:
 *
 *   1. El vendedor PIDE          → `solicitar()`  crea una SolicitudPrecioMinimo
 *                                  `pendiente`, opcionalmente atada a la atención
 *                                  en curso y con el motivo del pedido.
 *   2. Un admin RESUELVE         → `resolver()`   la pasa a `autorizada` (con el
 *                                  valor y hasta cuándo vale) o a `rechazada`.
 *   3. El valor VIAJA            → `autorizacionVigente()` / `adjuntarPrecioMinimo()`
 *                                  son el ÚNICO camino por el que
 *                                  `Vehiculo.precioMinimo` sale hacia el front de
 *                                  un vendedor, y sólo si hay una solicitud suya,
 *                                  para esa unidad, `autorizada` y no vencida.
 *
 * INVARIANTES (las tres cosas que este archivo existe para garantizar):
 *
 *   - `Vehiculo.precioMinimo` está FUERA de `VEHICULO_PUBLICO` y lo recorta
 *     `sanitizarDatosDeCompra` en VehiculoController, igual que `precioCompra`.
 *     Ningún listado, ningún include anidado y ningún CSV lo llevan.
 *   - Lo que se le muestra al vendedor es `precioAutorizado` (el SNAPSHOT que
 *     guardó la solicitud), NO `Vehiculo.precioMinimo` leído en vivo. Así el admin
 *     puede autorizar un piso puntual distinto del de la ficha para ESTE negocio,
 *     y lo que se mostró queda auditable aunque después cambie la ficha.
 *   - Una autorización vencida deja de destapar el precio aunque el estado siga
 *     en `autorizada`. El vencimiento se evalúa al LEER (no hay job que expire
 *     filas): un worker que se cae no puede dejar el piso abierto.
 */

/** Cuánto vale una autorización si el admin no dice otra cosa. */
export const HORAS_VIGENCIA_DEFAULT = 24;
/** Tope duro: nadie autoriza un piso "para siempre". */
export const HORAS_VIGENCIA_MAX = 24 * 15;

export interface DatosSolicitud {
    vehiculoId: number;
    atencionId?: number | null;
    motivo?: string | null;
}

export interface DatosResolucion {
    /** `true` autoriza, `false` rechaza. */
    autorizar: boolean;
    /** Piso puntual para este negocio. Si no viene, se toma el de la ficha. */
    precioAutorizado?: number | null;
    respuesta?: string | null;
    horasVigencia?: number | null;
}

/** Lo que se le devuelve al vendedor cuando su pedido está autorizado y vigente. */
export interface PrecioAutorizado {
    /** `null` cuando el acceso lo da el ROL (admin) y no una solicitud. */
    solicitudId: number | null;
    vehiculoId: number;
    precioMinimo: string;
    moneda: string;
    venceEl: Date | null;
    autorizadaPor: string | null;
    /** true = lo ve por su rol de supervisión, sin pedido ni vencimiento. */
    porRol?: boolean;
}

const aNumero = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * Crea (o reusa) el pedido del vendedor para ver el piso de una unidad.
 *
 * IDEMPOTENTE por (vehículo, solicitante): si ya hay una pendiente para esa
 * unidad se devuelve esa misma en vez de apilar pedidos. Un vendedor impaciente
 * que toca el botón cinco veces no le llena la bandeja al admin con cinco filas
 * idénticas — y el admin resuelve UNA cosa, no cinco.
 */
export async function solicitar(datos: DatosSolicitud): Promise<SolicitudPrecioMinimo> {
    const solicitanteId = actorUserId();
    if (!solicitanteId) throw new BaseException(401, 'Sin usuario en contexto', 'UNAUTHORIZED');

    // La unidad tiene que existir en el tenant (la extensión de Prisma scopea el
    // find). Se lee `precioMinimo` acá y NO se devuelve: sólo sirve para avisar
    // temprano que la ficha no lo tiene cargado, y para que el admin vea contra qué
    // está resolviendo.
    const vehiculo = await prisma.vehiculo.findUnique({
        where: { id: datos.vehiculoId },
        select: { id: true, marca: true, modelo: true, dominio: true, precioMinimo: true, moneda: true },
    });
    if (!vehiculo) throw new NotFoundException('Vehiculo');

    const pendiente = await prisma.solicitudPrecioMinimo.findFirst({
        where: { vehiculoId: datos.vehiculoId, solicitanteId, estado: 'pendiente' },
        orderBy: { id: 'desc' },
    });
    if (pendiente) return pendiente;

    // La extensión de Prisma inyecta el tenant en el create para todo el que no
    // sea super_admin, pero el tipo generado igual lo exige: se resuelve explícito
    // (mismo patrón que Sucursal/Usuario). Un super_admin sin tenant en contexto no
    // tiene por qué pedir un precio mínimo — es un puesto de plataforma, no de la
    // concesionaria — así que ahí se corta con un 400 legible.
    const concesionariaId = resolveConcesionariaId(null);
    if (!concesionariaId) {
        throw new BaseException(400, 'No se pudo resolver la concesionaria del pedido', 'VALIDATION_ERROR');
    }

    // `atencionId` llega del body como un entero cualquiera y los ids son un
    // SERIAL global: sin este chequeo la fila quedaba en este tenant con una FK a
    // la visita de OTRA concesionaria. La RLS no lo tapa — la política valida el
    // concesionaria_id de la fila que se escribe, no el de sus FKs, y la
    // integridad referencial de Postgres saltea RLS por diseño. Hoy nadie hace
    // `include: { atencion: ... }`, así que no hay fuga; el candado es para que no
    // la haya el día que alguien agregue ese include (que el propio flujo
    // anticipa). Mismo patrón que `abrirAtencion` con su `atencionAnteriorId`.
    await assertMismoTenant('atencion', datos.atencionId, concesionariaId);

    const creada = await prisma.solicitudPrecioMinimo.create({
        data: {
            concesionariaId,
            vehiculoId: datos.vehiculoId,
            atencionId: datos.atencionId ?? null,
            solicitanteId,
            motivo: datos.motivo ?? null,
            moneda: vehiculo.moneda ?? 'ARS',
            estado: 'pendiente',
        },
    });

    await audit({
        entidad: 'SolicitudPrecioMinimo',
        accion: 'create',
        entidadId: creada.id,
        detalle: `Pedido de precio mínimo para ${vehiculo.marca} ${vehiculo.modelo}${vehiculo.dominio ? ` (${vehiculo.dominio})` : ''}`,
    });
    return creada;
}

/**
 * El admin autoriza o rechaza. Deja el SNAPSHOT del valor y hasta cuándo vale.
 *
 * Sólo admin: la especificación dice "alguien con rol de supervisión", y el
 * `authorize('admin')` de la ruta ya lo impone; el chequeo se repite acá porque
 * este service también lo puede llamar otro caso de uso (el cierre de una
 * atención, por ejemplo) y el permiso no puede depender de por dónde se entró.
 */
export async function resolver(solicitudId: number, datos: DatosResolucion): Promise<SolicitudPrecioMinimo> {
    if (!actorEsAdmin()) {
        throw new BaseException(403, 'Sólo un administrador puede autorizar el precio mínimo', 'FORBIDDEN');
    }
    const resueltaPorId = actorUserId();

    const solicitud = await prisma.solicitudPrecioMinimo.findUnique({
        where: { id: solicitudId },
        include: { vehiculo: { select: { id: true, marca: true, modelo: true, dominio: true, precioMinimo: true, moneda: true } } },
    });
    if (!solicitud) throw new NotFoundException('SolicitudPrecioMinimo');
    if (solicitud.estado !== 'pendiente') {
        throw new BaseException(409, `La solicitud ya está ${solicitud.estado}`, 'CONFLICT');
    }

    if (!datos.autorizar) {
        const rechazada = await prisma.solicitudPrecioMinimo.update({
            where: { id: solicitudId },
            data: {
                estado: 'rechazada',
                resueltaPorId,
                resueltaEn: new Date(),
                respuesta: datos.respuesta ?? null,
                // Explícito: una rechazada NO lleva valor. Si quedara el snapshot de
                // un intento anterior, `autorizacionVigente` filtra por estado, pero
                // el dato seguiría en la fila y en cualquier dump.
                precioAutorizado: null,
                venceEl: null,
            },
        });
        await audit({ entidad: 'SolicitudPrecioMinimo', accion: 'update', entidadId: solicitudId, detalle: 'Precio mínimo RECHAZADO' });
        return rechazada;
    }

    // El valor: el que el admin escribe para este negocio, o el de la ficha.
    const deLaFicha = aNumero(solicitud.vehiculo?.precioMinimo);
    const valor = aNumero(datos.precioAutorizado) ?? deLaFicha;
    if (valor === null) {
        throw new BaseException(
            400,
            'La unidad no tiene precio mínimo cargado: indicá el valor a autorizar',
            'VALIDATION_ERROR',
        );
    }
    if (valor <= 0) throw new BaseException(400, 'El precio autorizado debe ser mayor a cero', 'VALIDATION_ERROR');

    const horas = Math.min(
        Math.max(Math.trunc(datos.horasVigencia ?? HORAS_VIGENCIA_DEFAULT), 1),
        HORAS_VIGENCIA_MAX,
    );
    const venceEl = new Date(Date.now() + horas * 60 * 60 * 1000);

    const autorizada = await prisma.solicitudPrecioMinimo.update({
        where: { id: solicitudId },
        data: {
            estado: 'autorizada',
            resueltaPorId,
            resueltaEn: new Date(),
            respuesta: datos.respuesta ?? null,
            precioAutorizado: valor,
            moneda: solicitud.vehiculo?.moneda ?? solicitud.moneda ?? 'ARS',
            venceEl,
        },
    });

    // Se audita el VALOR y el vencimiento: es el registro de quién destapó qué
    // piso, a quién y por cuánto tiempo. Sin esto la autorización no es auditable
    // y el control por sistema es decorativo.
    await audit({
        entidad: 'SolicitudPrecioMinimo',
        accion: 'update',
        entidadId: solicitudId,
        detalle: `Precio mínimo AUTORIZADO en ${valor} ${autorizada.moneda} hasta ${venceEl.toISOString()} (solicitante ${solicitud.solicitanteId})`,
    });
    return autorizada;
}

/**
 * ¿Hay una autorización vigente de ESTE usuario para ESTA unidad?
 *
 * El vencimiento se evalúa acá, al leer (`venceEl > ahora`), y no con un job que
 * pase las filas a `expirada`: si el job no corre, un `estado === 'autorizada'`
 * viejo seguiría destapando el piso. El estado `expirada` del enum queda para
 * marcar el histórico, no como condición de seguridad.
 *
 * EL ADMIN NO NECESITA SOLICITUD: ve el piso de la ficha por su rol. La rama está
 * ACÁ y no sólo en `adjuntarPrecioMinimo` porque este es el camino que usa
 * `GET /precio-minimo/vehiculo/:id` —el botón "Ver precio mínimo" del mostrador—,
 * y sin ella el propio supervisor recibía `autorizado: false`, la pantalla le
 * abría un pedido a su nombre y terminaba teniendo que autorizarse a sí mismo:
 * bandeja y auditoría contaminadas con pedidos del que otorga el permiso.
 *
 * `usuarioId` explícito significa "la autorización DE ESE usuario": ahí no se
 * aplica el atajo de rol, porque la pregunta ya no es sobre el actor.
 */
export async function autorizacionVigente(vehiculoId: number, usuarioId?: number): Promise<PrecioAutorizado | null> {
    const solicitanteId = usuarioId ?? actorUserId();
    if (!solicitanteId) return null;

    if (usuarioId === undefined && actorEsAdmin()) {
        const v = await prisma.vehiculo.findUnique({
            where: { id: vehiculoId },
            select: { id: true, precioMinimo: true, moneda: true },
        });
        if (!v || v.precioMinimo === null) return null;
        return {
            // Sin solicitud: el permiso lo da el rol, no una fila. `solicitudId: null`
            // es lo que le dice al front que no hay nada que mostrar como "autorizado
            // por Fulano hasta tal hora".
            solicitudId: null,
            vehiculoId: v.id,
            precioMinimo: String(v.precioMinimo),
            moneda: v.moneda ?? 'ARS',
            venceEl: null,
            autorizadaPor: null,
            porRol: true,
        };
    }

    const s = await prisma.solicitudPrecioMinimo.findFirst({
        where: {
            vehiculoId,
            solicitanteId,
            estado: 'autorizada',
            precioAutorizado: { not: null },
            // `venceEl: null` sería "sin vencimiento": `resolver` siempre lo setea,
            // pero el filtro es explícito para que una fila cargada a mano sin
            // vencimiento no se comporte como permanente.
            venceEl: { gt: new Date() },
        },
        orderBy: { id: 'desc' },
        include: { resueltaPor: { select: { nombre: true } } },
    });
    if (!s || s.precioAutorizado === null) return null;

    return {
        solicitudId: s.id,
        vehiculoId: s.vehiculoId,
        precioMinimo: String(s.precioAutorizado),
        moneda: s.moneda,
        venceEl: s.venceEl,
        autorizadaPor: s.resueltaPor?.nombre ?? null,
    };
}

/** Lo que `adjuntarPrecioMinimo` le suma a la ficha, según haya autorización o no. */
export interface DatosDePrecioMinimo {
    precioMinimo?: string;
    precioMinimoAutorizacion?: {
        /** `null` sólo si el acceso viniera por rol; acá nunca (el admin sale antes). */
        solicitudId: number | null;
        venceEl: Date | null;
        autorizadaPor: string | null;
        moneda: string;
    };
    precioMinimoSolicitud?: {
        id: number;
        estado: string;
        respuesta: string | null;
        venceEl: Date | null;
    } | null;
}

/**
 * Adjunta `precioMinimo` a la ficha de UN vehículo, si y sólo si corresponde.
 *
 * Es la única puerta de salida del dato. Tres caminos:
 *   - admin  → el de la ficha, tal cual (su rol ya lo habilita).
 *   - vendedor con autorización vigente → el SNAPSHOT autorizado, con el
 *     vencimiento y quién lo autorizó (para que la pantalla pueda decirlo).
 *   - cualquier otro → nada, y `precioMinimoSolicitud` cuenta en qué estado está
 *     su pedido, para que el front sepa si mostrar "Pedir autorización" o
 *     "Pendiente de autorización" sin adivinar.
 *
 * Se llama SÓLO en el detalle (`GET /vehiculos/:id`), nunca en el listado: hacer
 * una consulta de autorización por fila de una grilla de 5000 unidades no tiene
 * sentido, y el piso de venta no es un dato de grilla.
 */
export async function adjuntarPrecioMinimo<T extends { id: number }>(
    vehiculo: T,
): Promise<T | (T & DatosDePrecioMinimo)> {
    if (!vehiculo || typeof vehiculo !== 'object') return vehiculo;
    if (actorEsAdmin()) return vehiculo;

    const autorizacion = await autorizacionVigente(vehiculo.id);
    if (autorizacion) {
        return {
            ...vehiculo,
            precioMinimo: autorizacion.precioMinimo,
            precioMinimoAutorizacion: {
                solicitudId: autorizacion.solicitudId,
                venceEl: autorizacion.venceEl,
                autorizadaPor: autorizacion.autorizadaPor,
                moneda: autorizacion.moneda,
            },
        };
    }

    // Sin autorización: el campo NO viaja (`sanitizarDatosDeCompra` ya lo sacó) y
    // sólo se informa el estado del pedido.
    const ultima = await prisma.solicitudPrecioMinimo.findFirst({
        where: { vehiculoId: vehiculo.id, solicitanteId: actorUserId() },
        orderBy: { id: 'desc' },
        select: { id: true, estado: true, respuesta: true, venceEl: true },
    });
    return {
        ...vehiculo,
        precioMinimoSolicitud: ultima
            ? {
                id: ultima.id,
                // Una `autorizada` que llegó hasta acá es una vencida: se informa como
                // tal para que la pantalla ofrezca pedirla de nuevo en vez de mostrar
                // un "autorizada" que no destapa nada.
                estado: ultima.estado === 'autorizada' ? 'expirada' : ultima.estado,
                respuesta: ultima.respuesta,
                venceEl: ultima.venceEl,
            }
            : null,
    };
}

/**
 * Bandeja de solicitudes. El admin ve las del tenant; cualquier otro, sólo las
 * propias — el recorte va acá y no en el controller para que no dependa de por
 * qué ruta se entró.
 */
export async function listar(filtros: { estado?: string; vehiculoId?: number } = {}) {
    const where: Prisma.SolicitudPrecioMinimoWhereInput = {};
    if (filtros.estado) where.estado = filtros.estado as Prisma.SolicitudPrecioMinimoWhereInput['estado'];
    if (filtros.vehiculoId) where.vehiculoId = filtros.vehiculoId;
    if (!actorEsAdmin()) where.solicitanteId = actorUserId();

    const filas = await prisma.solicitudPrecioMinimo.findMany({
        where,
        orderBy: [{ estado: 'asc' }, { id: 'desc' }],
        take: 200,
        include: {
            vehiculo: { select: { id: true, marca: true, modelo: true, version: true, anio: true, dominio: true, precioLista: true, moneda: true } },
            solicitante: { select: { id: true, nombre: true } },
            resueltaPor: { select: { id: true, nombre: true } },
        },
    });

    const ahora = new Date();
    return filas.map((f) => {
        const vencida = f.estado === 'autorizada' && (!f.venceEl || f.venceEl <= ahora);
        // Al que NO es admin no se le devuelve el valor de una autorización que ya
        // no está vigente: la bandeja es una pantalla de lectura como cualquier
        // otra y no puede ser la puerta de atrás del recorte.
        const ocultarValor = !actorEsAdmin() && (vencida || f.estado !== 'autorizada');
        return {
            ...f,
            estado: vencida ? 'expirada' : f.estado,
            precioAutorizado: ocultarValor ? undefined : f.precioAutorizado,
        };
    });
}

/**
 * Recorte por rol del piso de venta, hermano de `sanitizarDatosDeCompra`.
 *
 * Se aplica a TODA respuesta que lleve un vehículo (listado, detalle, create,
 * update, transferir). El detalle vuelve a agregarlo después, ya pasado por
 * `adjuntarPrecioMinimo`, que es el único que sabe si corresponde.
 */
export function sanitizarPrecioMinimo<T>(vehiculo: T, esAdmin: boolean): T {
    if (esAdmin || !vehiculo || typeof vehiculo !== 'object') return vehiculo;
    const { precioMinimo: _oculto, ...resto } = vehiculo as T & { precioMinimo?: unknown };
    void _oculto;
    return resto as T;
}

/**
 * ¿El actor puede ESCRIBIR el piso de venta en la ficha? Sólo admin.
 *
 * El vendedor puede editar un vehículo (`PATCH /vehiculos/:id` es
 * `authorize('admin','vendedor')`), así que sin este chequeo podría fijarse el
 * piso que quiera y saltearse la autorización entera escribiendo en vez de
 * leyendo. Mismo argumento que `precioCompra`.
 */
export function assertPuedeEscribirPrecioMinimo(body: unknown): void {
    if (!body || typeof body !== 'object') return;
    if ((body as { precioMinimo?: unknown }).precioMinimo === undefined) return;
    if (actorEsAdmin()) return;
    throw new BaseException(403, 'Sólo un administrador puede fijar el precio mínimo de venta', 'FORBIDDEN');
}

/** Para los tests y para el front: ¿este actor tiene que pedir autorización? */
export const necesitaAutorizacion = (): boolean => actorEsVendedorPuro() || !actorEsAdmin();
