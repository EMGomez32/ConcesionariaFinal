import { OrigenLead } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { context } from '../../infrastructure/security/context';
import { assertMismoTenant } from '../../infrastructure/security/tenantGuard';

/**
 * Ingesta de consultas de venta (leads) — el camino COMÚN de todos los canales:
 * el modal "Nueva consulta" (request autenticado), el webhook de Meta y el
 * lector de emails de DeRuedas (contexto sistema).
 *
 * Reglas:
 *  - Dedupe por teléfono o email dentro del tenant: una consulta repetida NO
 *    crea otro cliente; reabre el lead si estaba ganado/perdido y anota la
 *    consulta en observaciones.
 *  - Asignación round-robin real: el vendedor activo con menos leads en
 *    'nuevo' (empate → menor id), salvo que venga vendedorId explícito.
 *  - NO crea ClienteSeguimiento: el "tiempo a primer contacto" del reporte de
 *    consultas mide el primer contacto REAL del vendedor; el texto de la
 *    consulta queda en observaciones del cliente.
 */

export interface ConsultaEntrante {
    origen: OrigenLead;
    nombre: string;
    telefono?: string | null;
    email?: string | null;
    /** Texto libre de la consulta (mensaje del lead, cuerpo del email, etc.). */
    texto?: string | null;
    /** Vehículo consultado, si se pudo identificar. */
    vehiculoId?: number | null;
    /** Vendedor elegido a mano; si falta se asigna por round-robin. */
    vendedorId?: number | null;
}

export interface ResultadoIngesta {
    clienteId: number;
    creado: boolean;
    reabierto: boolean;
    vendedorAsignadoId: number | null;
}

/**
 * Corre `fn` con un contexto de tenant sintético (para webhook/worker, donde no
 * hay request autenticado): la extensión de Prisma inyecta concesionariaId y
 * setea las session vars de RLS igual que en un request de admin del tenant.
 */
export const conContextoSistema = <T>(concesionariaId: number, fn: () => Promise<T>): Promise<T> =>
    context.run(
        { user: { userId: 0, concesionariaId, sucursalId: null, roles: ['admin'] }, correlationId: `ingesta-${concesionariaId}-${Date.now()}` },
        fn,
    );

/** Vendedor activo con menos leads en 'nuevo' (empate: menor id). Null si no hay. */
export async function elegirVendedorRoundRobin(): Promise<number | null> {
    const vendedores = await prisma.usuario.findMany({
        where: { activo: true, roles: { some: { rol: { nombre: 'vendedor' } } } },
        select: { id: true },
        orderBy: { id: 'asc' },
    });
    if (vendedores.length === 0) return null;
    const cargas = await prisma.cliente.groupBy({
        by: ['vendedorAsignadoId'],
        where: { estadoLead: 'nuevo', vendedorAsignadoId: { in: vendedores.map((v) => v.id) } },
        _count: { _all: true },
    });
    const carga = new Map<number, number>();
    for (const c of cargas) if (c.vendedorAsignadoId != null) carga.set(c.vendedorAsignadoId, c._count._all);
    let elegido = vendedores[0].id;
    let min = carga.get(elegido) ?? 0;
    for (const v of vendedores) {
        const n = carga.get(v.id) ?? 0;
        if (n < min) { elegido = v.id; min = n; }
    }
    return elegido;
}

/**
 * Dedupe compartido (consultas + import masivo): busca un cliente del tenant
 * por teléfono o email exactos (el que esté presente). Null si no hay match.
 */
export async function buscarClientePorContacto(telefono?: string | null, email?: string | null) {
    const tel = telefono?.trim() || null;
    const mail = email?.trim().toLowerCase() || null;
    const or: object[] = [];
    if (tel) or.push({ telefono: tel });
    if (mail) or.push({ email: mail });
    if (!or.length) return null;
    return prisma.cliente.findFirst({ where: { OR: or }, orderBy: { id: 'asc' } });
}

const lineaConsulta = (c: ConsultaEntrante): string => {
    const fecha = new Date().toISOString().slice(0, 10);
    const texto = (c.texto ?? '').trim().slice(0, 600);
    return `[${fecha}] Consulta por ${c.origen}${texto ? `: ${texto}` : ''}`;
};

export async function ingestarConsulta(consulta: ConsultaEntrante): Promise<ResultadoIngesta> {
    const telefono = consulta.telefono?.trim() || null;
    const email = consulta.email?.trim().toLowerCase() || null;

    // `vendedorId` llega del body (modal de consulta, lead de Mercado Libre) y
    // termina en cliente.vendedorAsignadoId. La RLS valida el concesionaria_id
    // de la FILA que se escribe, NO el de sus FKs, y la integridad referencial
    // de Postgres saltea RLS por diseño: sin este chequeo un id de otro tenant
    // pasaba y el lead quedaba asignado a alguien que para esta concesionaria no
    // existe — invisible en toda vista por vendedor y desbalanceando el
    // round-robin. Mismo candado que CreateCliente/UpdateCliente.
    await assertMismoTenant('usuario', consulta.vendedorId, context.getTenantId() ?? null);

    // Dedupe: mismo teléfono o email en el tenant (la extensión filtra tenant).
    const existente = await buscarClientePorContacto(telefono, email);

    if (existente) {
        const reabierto = existente.estadoLead === 'ganado' || existente.estadoLead === 'perdido';
        const vendedorAsignadoId = existente.vendedorAsignadoId
            ?? consulta.vendedorId
            ?? await elegirVendedorRoundRobin();
        await prisma.cliente.update({
            where: { id: existente.id },
            data: {
                estadoLead: reabierto ? 'nuevo' : existente.estadoLead,
                origenLead: existente.origenLead ?? consulta.origen,
                vendedorAsignadoId,
                observaciones: [existente.observaciones, lineaConsulta(consulta)].filter(Boolean).join('\n'),
            },
        });
        if (consulta.vehiculoId) await upsertInteres(existente.id, consulta.vehiculoId, consulta.texto);
        return { clienteId: existente.id, creado: false, reabierto, vendedorAsignadoId };
    }

    const vendedorAsignadoId = consulta.vendedorId ?? await elegirVendedorRoundRobin();
    const creado = await prisma.cliente.create({
        data: {
            // concesionariaId lo inyecta la extensión desde el contexto activo.
            nombre: consulta.nombre.trim() || 'Consulta sin nombre',
            telefono,
            email,
            origenLead: consulta.origen,
            estadoLead: 'nuevo',
            vendedorAsignadoId,
            observaciones: lineaConsulta(consulta),
        } as never,
    });
    if (consulta.vehiculoId) await upsertInteres(creado.id, consulta.vehiculoId, consulta.texto);
    return { clienteId: creado.id, creado: true, reabierto: false, vendedorAsignadoId };
}

async function upsertInteres(clienteId: number, vehiculoId: number, texto?: string | null): Promise<void> {
    // Si el vehículo no existe o es de otro tenant, la consulta igual vale: el
    // interés es best-effort.
    const vehiculo = await prisma.vehiculo.findFirst({ where: { id: vehiculoId }, select: { id: true } });
    if (!vehiculo) return;
    await prisma.vehiculoInteres.upsert({
        where: { clienteId_vehiculoId: { clienteId, vehiculoId } },
        update: { nota: texto?.slice(0, 180) ?? undefined },
        create: { clienteId, vehiculoId, nota: texto?.slice(0, 180) ?? null } as never,
    });
}
