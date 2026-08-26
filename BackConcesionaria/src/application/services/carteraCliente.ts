import prisma from '../../infrastructure/database/prisma';
import { context } from '../../infrastructure/security/context';
import { actorEsVendedorPuro, actorUserId } from '../../infrastructure/security/roles';

/**
 * CARTERA DEL VENDEDOR — quién ve a qué cliente.
 *
 * La especificación dice dos cosas que parecen contradecirse y no lo hacen:
 *
 *   (a) "El vendedor NO VE … clientes que no tenga asignados."
 *   (b) "Si un cliente asignado a otro vendedor vuelve al salón, el sistema AVISA
 *        antes de abrir la atención y registra quién lo atendió realmente."
 *
 * (b) sólo tiene sentido si el vendedor PUEDE atenderlo. Así que el corte no es
 * "403 sobre todo lo ajeno", es:
 *
 *   - LAS SUPERFICIES DE BARRIDO se recortan: el listado, el export CSV, el
 *     buscador global. Ahí es donde hoy un vendedor se lleva la cartera entera del
 *     tenant —5000 filas con DNI, teléfono, email y dirección— y eso no lo
 *     justifica ningún flujo de mostrador.
 *   - LA FICHA PUNTUAL sigue abierta, con AVISO y con registro: el cliente que
 *     entra por la puerta hay que poder atenderlo. `avisoDeAsignacion()` arma ese
 *     aviso, y el acceso a una ficha ajena queda auditado.
 *
 * QUÉ ENTRA EN LA CARTERA de un vendedor:
 *   1. lo asignado a él,
 *   2. lo que no tiene dueño,
 *   3. lo que tiene dueño pero VENCIÓ el plazo de retención.
 *
 * El punto 3 es el que hace que `diasRetencionCliente` signifique algo: sin él la
 * asignación sería para siempre y la configuración por concesionaria, decorativa.
 * El plazo se cuenta contra `ultimaInteraccionEn` —no contra `vendedorAsignadoEn`—
 * porque la retención se renueva con cada contacto real: un vendedor que sigue
 * trabajando a su cliente no lo pierde por calendario.
 */

/** Default del contrato si el tenant no tiene nada cargado. */
export const DIAS_RETENCION_DEFAULT = 30;

// Cache muy corta del parámetro del tenant. Se lee en CADA listado de clientes y
// en cada búsqueda global; sin esto, una pantalla que pagina agrega una consulta
// a `concesionarias` por request. 60s es más que suficiente: cambiar el plazo en
// Ajustes es una operación rara y tolera un minuto de retardo.
const TTL_MS = 60 * 1000;
const cacheConfig = new Map<number, { valor: ConfigCartera; expira: number }>();

export interface ConfigCartera {
    diasRetencionCliente: number;
    tasacionSoloTasador: boolean;
}

export async function configCartera(concesionariaId?: number): Promise<ConfigCartera> {
    const cid = concesionariaId ?? context.getUser()?.concesionariaId ?? 0;
    const hit = cacheConfig.get(cid);
    if (hit && hit.expira > Date.now()) return hit.valor;

    let valor: ConfigCartera = { diasRetencionCliente: DIAS_RETENCION_DEFAULT, tasacionSoloTasador: false };
    if (cid) {
        const c = await prisma.concesionaria.findUnique({
            where: { id: cid },
            select: { diasRetencionCliente: true, tasacionSoloTasador: true },
        });
        if (c) {
            valor = {
                diasRetencionCliente: c.diasRetencionCliente ?? DIAS_RETENCION_DEFAULT,
                tasacionSoloTasador: Boolean(c.tasacionSoloTasador),
            };
        }
    }
    cacheConfig.set(cid, { valor, expira: Date.now() + TTL_MS });
    return valor;
}

/** Invalida la cache: la llama el update de Ajustes para que el cambio se vea ya. */
export function invalidarConfigCartera(concesionariaId?: number): void {
    if (concesionariaId === undefined) cacheConfig.clear();
    else cacheConfig.delete(concesionariaId);
}

/**
 * Filtro de visibilidad de clientes para el actor. `null` = ve todo el tenant.
 *
 * Se devuelve un `where` de Prisma (no un post-filtro en memoria) a propósito: el
 * recorte tiene que entrar en el `count` de la paginación y en el `take` del CSV,
 * si no el vendedor ve "1 de 4230" y el total ya le contó la cartera ajena.
 */
export async function filtroCartera(): Promise<Record<string, unknown> | null> {
    if (!actorEsVendedorPuro()) return null;
    const userId = actorUserId();
    const { diasRetencionCliente } = await configCartera();

    const corte = new Date(Date.now() - diasRetencionCliente * 24 * 60 * 60 * 1000);

    return {
        OR: [
            // 1. Lo suyo.
            { vendedorAsignadoId: userId },
            // 2. Sin dueño.
            { vendedorAsignadoId: null },
            // 3. Con dueño pero VENCIDO: vuelve al pozo común. Ver
            //    `relojDeRetencionVencido` para por qué la cadena tiene tres
            //    escalones y por qué `ultimaInteraccionEn: null` NO alcanza para
            //    dar por vencida la asignación.
            {
                AND: [
                    { vendedorAsignadoId: { not: null } },
                    {
                        OR: [
                            { ultimaInteraccionEn: { lt: corte } },
                            { AND: [{ ultimaInteraccionEn: null }, { vendedorAsignadoEn: { lt: corte } }] },
                            { AND: [{ ultimaInteraccionEn: null }, { vendedorAsignadoEn: null }, { createdAt: { lt: corte } }] },
                        ],
                    },
                ],
            },
        ],
    };
}

/**
 * ¿Venció el plazo de retención de este cliente? La MISMA regla que el `where` de
 * `filtroCartera`, para el aviso (que se evalúa en memoria).
 *
 * EL RELOJ ES UNA CADENA, no un campo: `ultimaInteraccionEn` → `vendedorAsignadoEn`
 * → `createdAt`.
 *
 * POR QUÉ. Antes, `ultimaInteraccionEn` en null contaba como vencido, con el
 * argumento de que era "una ficha vieja del backfill". Eso es exactamente al
 * revés: la migración rellenó TODAS las filas viejas (con `createdAt`, que nunca
 * es null), así que el único conjunto que puede tener null es el de las fichas
 * NUEVAS. Un lead que entra por Instagram y el round-robin le asigna a Pérez
 * nacía con el reloj en null y por lo tanto "vencido" desde el minuto cero: el
 * aviso de "este cliente es de otro vendedor" nunca saltaba, y la ficha aparecía
 * en el listado y en el buscador de TODOS los vendedores del tenant — el barrido
 * de cartera ajena que este recorte viene a cerrar.
 *
 * Con la cadena, una asignación sin contacto posterior se mide contra la fecha en
 * que se asignó (o, si tampoco la hay, contra el alta de la ficha): la retención
 * empieza a correr cuando el cliente pasó a ser de alguien, que es lo que la regla
 * quiere decir. Y sigue venciendo sola, así que la asignación nunca es eterna.
 */
export function relojDeRetencionVencido(
    cliente: { ultimaInteraccionEn?: Date | string | null; vendedorAsignadoEn?: Date | string | null; createdAt?: Date | string | null },
    corte: number,
): boolean {
    const reloj = cliente.ultimaInteraccionEn ?? cliente.vendedorAsignadoEn ?? cliente.createdAt ?? null;
    if (!reloj) return true;
    const t = new Date(reloj).getTime();
    return Number.isNaN(t) || t < corte;
}

/** Combina el filtro de cartera con el `where` que ya trae la consulta. */
export async function conFiltroCartera(where: Record<string, any>): Promise<Record<string, any>> {
    const filtro = await filtroCartera();
    if (!filtro) return where;
    // Se usa AND y NO se pisa un `OR` existente: el listado ya arma su propio OR
    // para el buscador por nombre/dni, y mezclarlos ensancharía el recorte.
    const previos = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    return { ...where, AND: [...previos, filtro] };
}

export interface AvisoAsignacion {
    esDeOtroVendedor: boolean;
    vendedorAsignadoId: number | null;
    vendedorAsignado: string | null;
    /** El plazo ya venció: cualquiera lo puede tomar sin pedirle nada a nadie. */
    retencionVencida: boolean;
    diasRetencion: number;
    /** Texto listo para mostrar arriba del botón "Abrir atención". */
    mensaje: string | null;
}

/**
 * El aviso de "este cliente es de otro vendedor", para la apertura de la atención.
 *
 * NO bloquea: devuelve el texto y los datos para que la pantalla lo muestre y el
 * vendedor decida. La reasignación la autoriza un supervisor y no pasa por acá.
 */
export interface ClienteParaAviso {
    vendedorAsignadoId?: number | null;
    vendedorAsignado?: { nombre?: string | null } | null;
    ultimaInteraccionEn?: Date | string | null;
    /** Fallback del reloj de retención. Ver `relojDeRetencionVencido`. */
    vendedorAsignadoEn?: Date | string | null;
    createdAt?: Date | string | null;
}

export async function avisoDeAsignacion(cliente: ClienteParaAviso | null | undefined): Promise<AvisoAsignacion> {
    const { diasRetencionCliente } = await configCartera();
    const userId = actorUserId();
    const duenoId: number | null = cliente?.vendedorAsignadoId ?? null;
    const nombre: string | null = cliente?.vendedorAsignado?.nombre ?? null;

    const corte = Date.now() - diasRetencionCliente * 24 * 60 * 60 * 1000;
    const retencionVencida = relojDeRetencionVencido(cliente ?? {}, corte);

    const esDeOtroVendedor = Boolean(duenoId) && duenoId !== userId;
    let mensaje: string | null = null;
    if (esDeOtroVendedor) {
        mensaje = retencionVencida
            ? `Este cliente estaba asignado a ${nombre ?? 'otro vendedor'}, pero la retención de ${diasRetencionCliente} días venció. Podés atenderlo.`
            : `Este cliente está asignado a ${nombre ?? 'otro vendedor'}. Podés atenderlo, y va a quedar registrado que lo atendiste vos. La reasignación la autoriza un supervisor.`;
    }

    return {
        esDeOtroVendedor,
        vendedorAsignadoId: duenoId,
        vendedorAsignado: nombre,
        retencionVencida,
        diasRetencion: diasRetencionCliente,
        mensaje,
    };
}

/**
 * Renueva el reloj de la retención de un cliente.
 *
 * TIENE QUE PASAR EN todo camino que sea un CONTACTO REAL con el cliente: abrir
 * una atención en el mostrador, registrar un seguimiento, ingerir una consulta
 * nueva por cualquier canal. Sin eso, `ultimaInteraccionEn` se queda quieto y a
 * los `diasRetencionCliente` TODA la cartera cae al pozo común aunque el vendedor
 * la esté trabajando — que es exactamente lo contrario de lo que la regla quiere.
 *
 * DÓNDE PASA HOY (mantener esta lista al día):
 *   - `atencionService`: apertura, registro de interés y cierre de la visita, por
 *     esta función.
 *   - `CreateClienteSeguimiento`: por esta función, después del alta.
 *   - `consultaIngest`: NO la llama — escribe `ultimaInteraccionEn` DENTRO del
 *     mismo `create`/`update` del cliente, que es una escritura menos y no deja
 *     una ventana en la que la ficha esté actualizada y el reloj no. Si cambiás
 *     el criterio del reloj, ese es el otro lugar donde mirar.
 *
 * NO ES CONTACTO: crear o importar una ficha. Ahí lo que corre es
 * `vendedorAsignadoEn`, que es el segundo escalón del reloj (ver
 * `relojDeRetencionVencido`).
 *
 * ABRIR LA FICHA NO ES UN CONTACTO y por eso `ClienteController.getById` no la
 * llama: si mirar la pantalla renovara la retención, un vendedor conservaría su
 * cartera para siempre pasando el mouse por el listado.
 *
 * No tira si el cliente no existe (`updateMany` sobre 0 filas): es un efecto
 * lateral de otro caso de uso y no puede tumbar la operación principal.
 */
export async function tocarUltimaInteraccion(clienteId: number, cuando: Date = new Date()): Promise<void> {
    await prisma.cliente.updateMany({ where: { id: clienteId }, data: { ultimaInteraccionEn: cuando } });
}
