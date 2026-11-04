import { Prisma } from '@prisma/client';
import prisma from '../../../infrastructure/database/prisma';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { audit } from '../../../infrastructure/security/audit';
import { context } from '../../../infrastructure/security/context';
import { resolveConcesionariaId } from '../../../infrastructure/security/resolveConcesionariaId';
import { BaseException, NotFoundException, ValidationException } from '../../../domain/exceptions/BaseException';
import {
    TipoSolicitudTitular,
    aDiaUtc,
    estaVencida,
    vencimientoLegal,
} from '../../../domain/services/plazosTitular';

/**
 * REGISTRO DE PEDIDOS DE LOS TITULARES (ISO 27701 A.7.3.9; arts. 14-16 Ley 25.326).
 *
 * Cada pedido entra con su fecha de recepción y su vencimiento legal ya calculado. Se
 * puede pasar a "en curso", "resuelta" o "rechazada" (estas dos exigen la resolución
 * escrita: es lo que se le contestó al titular). No se borra ni se le cambia el tipo o la
 * fecha de recepción: el registro existe para poder demostrar el cumplimiento, y un plazo
 * que se puede mover no demuestra nada.
 */

export type EstadoSolicitudTitular = 'pendiente' | 'en_curso' | 'resuelta' | 'rechazada';
const CERRADOS: EstadoSolicitudTitular[] = ['resuelta', 'rechazada'];

const DIA_MS = 86_400_000;

type FilaSolicitud = Prisma.SolicitudTitularGetPayload<{ include: { cliente: { select: { id: true; nombre: true; apellido: true } } } }>;

/** Nombres de quién la registró / atendió. Sin FK (ver schema): se resuelven aparte. */
async function nombresDeUsuarios(ids: number[]): Promise<Map<number, string>> {
    const unicos = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
    if (unicos.length === 0) return new Map();
    const usuarios = await prisma.usuario.findMany({ where: { id: { in: unicos } }, select: { id: true, nombre: true } });
    return new Map(usuarios.map((u) => [u.id, u.nombre]));
}

function serializar(s: FilaSolicitud, nombres: Map<number, string>, ahora: Date) {
    const vencida = estaVencida(s, ahora);
    const abierta = !CERRADOS.includes(s.estado as EstadoSolicitudTitular);
    return {
        ...s,
        recibidaEl: s.recibidaEl.toISOString().slice(0, 10),
        venceEl: s.venceEl.toISOString().slice(0, 10),
        vencida,
        /** Días hasta el vencimiento (negativo = vencida). Null si ya está cerrada. */
        diasRestantes: abierta ? Math.round((aDiaUtc(s.venceEl).getTime() - aDiaUtc(ahora).getTime()) / DIA_MS) : null,
        registradaPor: s.registradaPorId ? nombres.get(s.registradaPorId) ?? null : null,
        atendidaPor: s.atendidaPorId ? nombres.get(s.atendidaPorId) ?? null : null,
    };
}

/**
 * ¿La ficha es de esta concesionaria? Va por una transacción RAW (no la extensión) para
 * aceptar también fichas dadas de baja o ya suprimidas: el pedido se puede registrar
 * después de atenderlo, y la ficha suprimida sale de los listados.
 */
async function clienteDelTenant(clienteId: number, concesionariaId: number): Promise<boolean> {
    const c = await withTenantTransaction((tx) => tx.cliente.findFirst({ where: { id: clienteId, concesionariaId }, select: { id: true } }));
    return !!c;
}

const INCLUDE = { cliente: { select: { id: true, nombre: true, apellido: true } } } as const;

export async function listarSolicitudesTitular(q: {
    estado?: string;
    tipo?: string;
    clienteId?: number;
    soloAbiertas?: boolean;
    page?: number;
    limit?: number;
}) {
    const limit = Math.min(Math.max(Math.trunc(Number(q.limit)) || 50, 1), 200);
    const page = Math.min(Math.max(Math.trunc(Number(q.page)) || 1, 1), 10_000);
    const where: Prisma.SolicitudTitularWhereInput = {};
    if (q.estado) where.estado = q.estado as EstadoSolicitudTitular;
    if (q.tipo) where.tipo = q.tipo as TipoSolicitudTitular;
    if (q.clienteId) where.clienteId = q.clienteId;
    if (q.soloAbiertas) where.estado = { in: ['pendiente', 'en_curso'] };

    const [filas, total, vencidas] = await Promise.all([
        prisma.solicitudTitular.findMany({
            where,
            include: INCLUDE,
            // Lo abierto que vence antes, primero: es la lista de trabajo.
            orderBy: [{ venceEl: 'asc' }, { id: 'asc' }],
            take: limit,
            skip: (page - 1) * limit,
        }),
        prisma.solicitudTitular.count({ where }),
        prisma.solicitudTitular.count({
            where: { estado: { in: ['pendiente', 'en_curso'] }, venceEl: { lt: aDiaUtc(new Date()) } },
        }),
    ]);
    const nombres = await nombresDeUsuarios(filas.flatMap((f) => [f.registradaPorId ?? 0, f.atendidaPorId ?? 0]));
    const ahora = new Date();
    return {
        results: filas.map((f) => serializar(f, nombres, ahora)),
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalResults: total,
        vencidas,
    };
}

export async function obtenerSolicitudTitular(id: number) {
    const fila = await prisma.solicitudTitular.findFirst({ where: { id }, include: INCLUDE });
    if (!fila) throw new NotFoundException('Solicitud del titular');
    const nombres = await nombresDeUsuarios([fila.registradaPorId ?? 0, fila.atendidaPorId ?? 0]);
    return serializar(fila, nombres, new Date());
}

export async function crearSolicitudTitular(datos: {
    concesionariaId?: number;
    tipo: TipoSolicitudTitular;
    titularNombre: string;
    clienteId?: number;
    canal?: string;
    detalle?: string;
    recibidaEl?: string;
}) {
    const concesionariaId = resolveConcesionariaId(datos.concesionariaId);
    if (!concesionariaId) {
        throw new BaseException(400, 'Elegí la concesionaria a la que llegó el pedido.', 'VALIDATION_ERROR');
    }

    if (datos.clienteId) {
        // La ficha tiene que ser de la MISMA concesionaria: si no, el registro de un
        // tenant apuntaría al cliente de otro.
        if (!(await clienteDelTenant(datos.clienteId, concesionariaId))) throw new ValidationException([{ campo: 'clienteId', mensaje: 'El cliente no existe en esta concesionaria' }], 'El cliente no existe en esta concesionaria');
    }

    const hoy = aDiaUtc(new Date());
    const recibidaEl = datos.recibidaEl ? aDiaUtc(new Date(`${datos.recibidaEl}T00:00:00Z`)) : hoy;
    if (recibidaEl.getTime() > hoy.getTime()) {
        throw new ValidationException([{ campo: 'recibidaEl', mensaje: 'La fecha de recepción no puede ser futura' }], 'La fecha de recepción no puede ser futura');
    }
    const venceEl = vencimientoLegal(datos.tipo, recibidaEl);

    const creada = await prisma.solicitudTitular.create({
        data: {
            concesionariaId,
            tipo: datos.tipo,
            titularNombre: datos.titularNombre.trim(),
            clienteId: datos.clienteId ?? null,
            canal: datos.canal?.trim() || null,
            detalle: datos.detalle?.trim() || null,
            recibidaEl,
            venceEl,
            registradaPorId: context.getUser()?.userId ?? null,
        },
        include: INCLUDE,
    });
    await audit({
        entidad: 'SolicitudTitular',
        accion: 'create',
        entidadId: creada.id,
        concesionariaId,
        detalle: `Pedido de ${datos.tipo} registrado (vence el ${venceEl.toISOString().slice(0, 10)})`,
    });
    const nombres = await nombresDeUsuarios([creada.registradaPorId ?? 0]);
    return serializar(creada, nombres, new Date());
}

export async function actualizarSolicitudTitular(id: number, datos: {
    estado?: EstadoSolicitudTitular;
    resolucion?: string;
    canal?: string;
    detalle?: string;
    clienteId?: number | null;
}) {
    const actual = await prisma.solicitudTitular.findFirst({ where: { id } });
    if (!actual) throw new NotFoundException('Solicitud del titular');
    if (CERRADOS.includes(actual.estado as EstadoSolicitudTitular)) {
        throw new BaseException(409, 'Este pedido ya está cerrado: el registro no se reabre. Si el titular vuelve a pedir, registrá un pedido nuevo.', 'SOLICITUD_CERRADA');
    }

    const data: Prisma.SolicitudTitularUncheckedUpdateInput = {};
    const userId = context.getUser()?.userId ?? null;

    if (datos.clienteId !== undefined) {
        if (datos.clienteId !== null) {
            if (!(await clienteDelTenant(datos.clienteId, actual.concesionariaId))) throw new ValidationException([{ campo: 'clienteId', mensaje: 'El cliente no existe en esta concesionaria' }], 'El cliente no existe en esta concesionaria');
        }
        data.clienteId = datos.clienteId;
    }
    if (datos.canal !== undefined) data.canal = datos.canal.trim() || null;
    if (datos.detalle !== undefined) data.detalle = datos.detalle.trim() || null;
    if (datos.resolucion !== undefined) data.resolucion = datos.resolucion.trim() || null;

    if (datos.estado && datos.estado !== actual.estado) {
        if (CERRADOS.includes(datos.estado)) {
            const resolucion = (datos.resolucion ?? actual.resolucion ?? '').trim();
            if (!resolucion) {
                throw new ValidationException(
                    [{ campo: 'resolucion', mensaje: 'Escribí qué se le respondió al titular' }],
                    'Para cerrar el pedido escribí qué se le respondió al titular',
                );
            }
            data.resueltaEn = new Date();
        }
        data.estado = datos.estado;
        if (!actual.atendidaPorId || CERRADOS.includes(datos.estado)) data.atendidaPorId = userId;
    }

    const actualizada = await prisma.solicitudTitular.update({ where: { id }, data, include: INCLUDE });
    await audit({
        entidad: 'SolicitudTitular',
        accion: 'update',
        entidadId: id,
        concesionariaId: actual.concesionariaId,
        detalle: datos.estado && datos.estado !== actual.estado
            ? `Pedido de ${actual.tipo}: ${actual.estado} → ${datos.estado}`
            : `Pedido de ${actual.tipo} actualizado`,
    });
    const nombres = await nombresDeUsuarios([actualizada.registradaPorId ?? 0, actualizada.atendidaPorId ?? 0]);
    return serializar(actualizada, nombres, new Date());
}
