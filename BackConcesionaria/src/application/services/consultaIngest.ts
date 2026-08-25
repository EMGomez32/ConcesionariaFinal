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
 *    consulta en observaciones. EXCEPCIÓN: una consulta `simulada` que cae sobre
 *    una ficha real sólo anota la línea (ver `sobreFichaReal`).
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
    /**
     * La consulta la fabricó el sistema (modo demostración de Mercado Libre o de
     * los canales de Meta), no un interesado real. Marca la ficha y la línea de
     * observaciones: el lead queda en el CRM —y sobrevive a apagar la
     * demostración— así que tiene que poder distinguirse de una consulta de
     * verdad en cualquier pantalla. Y gobierna la rama de dedupe: sobre una
     * ficha REAL preexistente lo simulado no escribe nada más que esa línea.
     */
    simulada?: boolean;
}

export interface ResultadoIngesta {
    clienteId: number;
    creado: boolean;
    reabierto: boolean;
    vendedorAsignadoId: number | null;
    /**
     * La consulta era SIMULADA y el dedupe la hizo caer sobre una ficha que NO
     * nació de la simulación (un cliente de verdad con ese teléfono o ese mail).
     * Ahí la ingesta sólo anota la línea de observaciones y no le toca nada más:
     * el flag sube para que el aviso de la pantalla lo diga en vez de anunciar
     * un alta que no pasó.
     */
    sobreFichaReal: boolean;
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

/**
 * Dedupe de las consultas SIMULADAS que no traen ni teléfono ni email.
 *
 * POR QUÉ: un hilo simulado (o una pregunta simulada de Mercado Libre) no tiene
 * ninguno de los dos, así que `buscarClientePorContacto` no puede matchear y
 * cada corrida de la demostración dejaba OTRA ficha idéntica en el CRM —
 * "Ariel Sosa (DEMO)" cinco veces a la quinta demostración—. Los clientes no se
 * borran al salir del modo demostración (pueden ser una ficha real que la
 * ingesta actualizó), así que la acumulación hay que evitarla acá, no limpiarla
 * después.
 *
 * El match es DELIBERADAMENTE angosto: sólo contra fichas ya marcadas
 * `origenSimulado` y sin contacto cargado, que es exactamente la ficha que deja
 * una demostración anterior. Nunca puede caer sobre un cliente real —esos no
 * tienen `origenSimulado`— ni sobre uno al que el vendedor le cargó el teléfono
 * a mano (ese lo levanta el dedupe normal, por teléfono).
 */
async function buscarFichaSimuladaSinContacto(nombre: string) {
    const limpio = nombre.trim();
    if (!limpio) return null;
    return prisma.cliente.findFirst({
        where: { origenSimulado: true, telefono: null, email: null, nombre: limpio },
        orderBy: { id: 'asc' },
    });
}

const lineaConsulta = (c: ConsultaEntrante): string => {
    const fecha = new Date().toISOString().slice(0, 10);
    const texto = (c.texto ?? '').trim().slice(0, 600);
    // Una consulta simulada NO puede quedar escrita como "Consulta por
    // mercadolibre": el texto es el de una pregunta que sembró el sistema y la
    // línea sobrevive a apagar la demostración, así que afirmaría para siempre
    // un origen que nunca existió.
    const encabezado = c.simulada
        ? `Consulta SIMULADA (modo demostración de ${c.origen}: no la hizo ningún interesado real)`
        : `Consulta por ${c.origen}`;
    return `[${fecha}] ${encabezado}${texto ? `: ${texto}` : ''}`;
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
    // Si la consulta es SIMULADA y no trae contacto, el segundo escalón la ata a
    // la ficha que dejó la demostración anterior en vez de crear otra igual.
    const existente = await buscarClientePorContacto(telefono, email)
        ?? (consulta.simulada === true ? await buscarFichaSimuladaSinContacto(consulta.nombre) : null);

    if (existente) {
        // Una consulta SIMULADA que cae sobre una ficha REAL (el operador cargó
        // un teléfono que ya estaba en el CRM) NO puede escribirle nada al
        // cliente salvo la línea de observaciones, que ya viene rotulada:
        //  - `origenLead` le dejaría escrito para siempre "instagram" a alguien
        //    que nunca escribió por Instagram, y la ficha NO lleva chip de
        //    simulación (`origenSimulado` es del cliente, y este es real), así
        //    que ese origen inventado sale en el reporte de consultas como un
        //    lead entrante de un canal que no existió.
        //  - `estadoLead` lo sacaría de 'ganado'/'perdido' y lo devolvería a
        //    'nuevo': el embudo y la señal de "consultas sin atender" del
        //    dashboard —dos números que se le muestran al comprador— se mueven
        //    por una charla que no tuvo nadie.
        // Con `origenSimulado` la ficha ya es parte de la demostración y se
        // actualiza como siempre.
        const sobreFichaReal = consulta.simulada === true && existente.origenSimulado !== true;
        const reabierto = !sobreFichaReal
            && (existente.estadoLead === 'ganado' || existente.estadoLead === 'perdido');
        const vendedorAsignadoId = sobreFichaReal
            ? existente.vendedorAsignadoId
            : (existente.vendedorAsignadoId ?? consulta.vendedorId ?? await elegirVendedorRoundRobin());
        await prisma.cliente.update({
            where: { id: existente.id },
            data: {
                estadoLead: reabierto ? 'nuevo' : existente.estadoLead,
                origenLead: sobreFichaReal ? existente.origenLead : (existente.origenLead ?? consulta.origen),
                vendedorAsignadoId,
                observaciones: [existente.observaciones, lineaConsulta(consulta)].filter(Boolean).join('\n'),
            },
        });
        // El interés por un vehículo tampoco: sería una ficha real "interesada"
        // en un auto por el que nunca preguntó.
        if (consulta.vehiculoId && !sobreFichaReal) {
            await upsertInteres(existente.id, consulta.vehiculoId, consulta.texto);
        }
        return { clienteId: existente.id, creado: false, reabierto, vendedorAsignadoId, sobreFichaReal };
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
            // La marca va SÓLO en la ficha nueva. En la rama de dedupe de arriba
            // el cliente puede ser uno REAL preexistente (el operador cargó un
            // teléfono ya conocido): rotularlo de simulado sería el error
            // inverso, así que ahí el rastro queda en las observaciones — y por
            // lo mismo esa rama no le escribe NADA más (`sobreFichaReal`).
            origenSimulado: consulta.simulada === true,
        } as never,
    });
    if (consulta.vehiculoId) await upsertInteres(creado.id, consulta.vehiculoId, consulta.texto);
    return { clienteId: creado.id, creado: true, reabierto: false, vendedorAsignadoId, sobreFichaReal: false };
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
