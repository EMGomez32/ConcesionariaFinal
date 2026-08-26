import { OrigenLead, Prisma } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import {
    ContactoDedupe,
    elegirPorPrioridad,
    normalizarEmail,
    normalizarDni,
    variantesDni,
} from '../../domain/services/dedupeContacto';
import { normalizarTelefono, sufijoTelefono } from '../../domain/services/telefono';
import { context } from '../../infrastructure/security/context';
import { assertMismoTenant } from '../../infrastructure/security/tenantGuard';

/**
 * Ingesta de consultas de venta (leads) — el camino COMÚN de todos los canales:
 * el modal "Nueva consulta" (request autenticado), el webhook de Meta y el
 * lector de emails de DeRuedas (contexto sistema).
 *
 * Reglas:
 *  - Dedupe por TELÉFONO → DNI → EMAIL dentro del tenant (ver
 *    `buscarClientePorContacto`): una consulta repetida NO crea otro cliente;
 *    reabre el lead si estaba ganado/perdido y anota la consulta en
 *    observaciones. EXCEPCIÓN: una consulta `simulada` que cae sobre
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
    /**
     * Documento, si el canal lo trae. No lo pide ninguna consulta de redes, pero
     * participa del dedupe (TELÉFONO → DNI → EMAIL) y lo van a traer la apertura
     * de atención presencial y el import de cartera.
     */
    dni?: string | null;
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
 * Tope de candidatos que se traen de la base antes de resolver la prioridad en
 * memoria. El sufijo de 4 dígitos acota a ~1 de cada 10.000 fichas: con 500 el
 * margen alcanza para una cartera de cientos de miles de clientes.
 */
const TOPE_CANDIDATOS = 500;

/**
 * Dedupe compartido (consultas de los 4 canales + import masivo): busca el
 * cliente del tenant que corresponde a este contacto, con prioridad
 * TELÉFONO → DNI → EMAIL. El primero que matchea gana. Null si no hay match.
 *
 * POR QUÉ NO ES UN `findFirst` CON UN OR: el teléfono se compara por su forma
 * CANÓNICA (ver domain/services/telefono.ts), no por el texto, y eso Postgres no
 * lo puede evaluar sin una columna normalizada. Entonces el query TRAE
 * candidatos y `elegirPorPrioridad` —puro y testeado sin base— decide cuál gana.
 *
 * LA COMPARACIÓN SE NORMALIZA ACÁ, AL CONSULTAR — la decisión y su motivo:
 *  - El criterio que decide el dedupe es `normalizarTelefono` corriendo sobre los
 *    candidatos, no la columna `telefono_normalizado`. Así el resultado no depende
 *    de que TODOS los caminos de escritura se hayan acordado de mantenerla: el día
 *    que uno se olvide, el duplicado volvería EN SILENCIO, que es exactamente el
 *    bug que este punto viene a cerrar.
 *  - El texto que se guarda sigue siendo el que tipeó el vendedor (es lo que se
 *    muestra y lo que se disca); la forma canónica es sólo criterio de
 *    comparación, no un dato del cliente.
 *  - El costo está acotado: un query por dedupe, filtrado por los últimos 4
 *    dígitos, con tope de filas.
 *
 * Y LA COLUMNA IGUAL SE MANTIENE, desde TODOS los caminos de escritura (esta
 * ingesta, el import de cartera, el alta/edición de cliente y la atención
 * presencial). No es redundancia: es la precondición de la salida documentada
 * para cuando el LIKE pese —columna indexada + igualdad—. Una columna a medio
 * cablear haría que ese cambio, hecho de buena fe siguiendo el comentario del
 * schema, dejara sin match a todo cliente creado por un canal que no la escribía.
 * Si se cambia `normalizarTelefono`, se cambia también `normalizar_telefono_ar()`
 * (la función SQL del backfill).
 */
export async function buscarClientePorContacto(contacto: ContactoDedupe) {
    const telefono = contacto.telefono?.trim() || null;
    const dni = contacto.dni?.trim() || null;
    const email = normalizarEmail(contacto.email);

    const or: Prisma.ClienteWhereInput[] = [];
    if (telefono) {
        // Igualdad literal: red de seguridad para los teléfonos que NO se pueden
        // normalizar (un interno, texto de una importación vieja) y para las
        // escrituras raras donde los últimos 4 dígitos no quedan pegados. Es el
        // criterio que regía antes: así no se pierde ningún match que hoy ande.
        or.push({ telefono });
        const sufijo = sufijoTelefono(telefono);
        if (sufijo) or.push({ telefono: { contains: sufijo } });
    }
    if (dni) {
        or.push({ dni });
        const dniNormalizado = normalizarDni(dni);
        if (dniNormalizado) or.push({ dni: { in: variantesDni(dniNormalizado) } });
    }
    if (email) or.push({ email });
    if (!or.length) return null;

    // La extensión de Prisma acota al tenant y descarta los borrados.
    const candidatos = await prisma.cliente.findMany({
        where: { OR: or },
        orderBy: { id: 'asc' },
        take: TOPE_CANDIDATOS,
    });

    return elegirPorPrioridad({ telefono, dni, email }, candidatos)?.cliente ?? null;
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
    const email = normalizarEmail(consulta.email);
    const dni = consulta.dni?.trim() || null;
    const telefonoCanonico = normalizarTelefono(telefono);
    const ahora = new Date();

    // `vendedorId` llega del body (modal de consulta, lead de Mercado Libre) y
    // termina en cliente.vendedorAsignadoId. La RLS valida el concesionaria_id
    // de la FILA que se escribe, NO el de sus FKs, y la integridad referencial
    // de Postgres saltea RLS por diseño: sin este chequeo un id de otro tenant
    // pasaba y el lead quedaba asignado a alguien que para esta concesionaria no
    // existe — invisible en toda vista por vendedor y desbalanceando el
    // round-robin. Mismo candado que CreateCliente/UpdateCliente.
    await assertMismoTenant('usuario', consulta.vendedorId, context.getTenantId() ?? null);

    // Dedupe: teléfono (normalizado), después DNI, después email, dentro del
    // tenant (la extensión filtra tenant). Si la consulta es SIMULADA y no trae
    // contacto, el segundo escalón la ata a la ficha que dejó la demostración
    // anterior en vez de crear otra igual.
    const existente = await buscarClientePorContacto({ telefono, dni, email })
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
                // EL RELOJ DE LA RETENCIÓN. Una consulta que entra por un canal ES
                // un contacto real (lo dice el propio contrato de
                // `tocarUltimaInteraccion`), y hasta ahora ningún canal lo tocaba:
                // sólo lo escribía el mostrador. Eso dejaba a todo lead de
                // Instagram/Messenger/WhatsApp/ML/DeRuedas con el reloj sin correr
                // y la regla de retención sin efecto fuera del salón. Se escribe
                // en la MISMA sentencia (no con una llamada aparte) para que no
                // haya una ventana en la que la ficha quede actualizada y el reloj
                // no.
                ultimaInteraccionEn: ahora,
                // La asignación se estrena acá cuando la ficha no tenía dueño: la
                // fecha es lo que después mide la retención si nunca hay otro
                // contacto.
                ...(existente.vendedorAsignadoId == null && vendedorAsignadoId != null
                    ? { vendedorAsignadoEn: ahora }
                    : {}),
                // Forma canónica del teléfono: el dedupe de hoy la calcula al
                // consultar, pero la columna existe y está indexada, así que tiene
                // que quedar en sintonía con el teléfono guardado.
                ...(telefonoCanonico && existente.telefonoNormalizado !== telefonoCanonico
                    ? { telefonoNormalizado: telefonoCanonico }
                    : {}),
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
            // El teléfono se guarda TAL CUAL lo tipearon: es lo que se muestra y
            // lo que se disca. La forma canónica va aparte, en su columna: es
            // criterio de comparación del dedupe, no un dato del cliente.
            telefonoNormalizado: telefonoCanonico,
            dni,
            origenLead: consulta.origen,
            estadoLead: 'nuevo',
            vendedorAsignadoId,
            // El reloj de la retención arranca con el contacto que creó la ficha.
            // Sin esto la asignación del round-robin nacía "vencida" y el lead caía
            // al pozo común de todos los vendedores desde el minuto cero.
            ultimaInteraccionEn: ahora,
            vendedorAsignadoEn: vendedorAsignadoId != null ? ahora : null,
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
