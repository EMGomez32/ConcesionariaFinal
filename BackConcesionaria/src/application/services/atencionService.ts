import { EstadoVehiculo, Prisma } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { ingestarConsulta, buscarClientePorContacto } from './consultaIngest';
import { AvisoAsignacion, ClienteParaAviso, avisoDeAsignacion, configCartera, tocarUltimaInteraccion } from './carteraCliente';
import { normalizarTelefono } from '../../domain/services/telefono';
import {
    sugerir,
    calcularPresupuestoReal,
    ESTADOS_DISPONIBLES,
    ModoBusqueda,
    ParamsBusqueda,
    Sugerencia,
    UnidadCandidata,
    UnidadYaMostrada,
} from '../../domain/services/sugerenciasVehiculo';
import {
    contarAtencionesCerradasPorSistema,
    corteVigenteDeLaJornada,
    ventanaDeAlerta,
} from '../../infrastructure/atencion/cierreDiarioWorker';
import { context } from '../../infrastructure/security/context';
import { actorEsAdmin, actorEsSuperAdmin, actorEsVendedorPuro, actorUserId } from '../../infrastructure/security/roles';
import { assertMismoTenant } from '../../infrastructure/security/tenantGuard';
import { audit } from '../../infrastructure/security/audit';
import {
    BaseException,
    ForbiddenException,
    NotFoundException,
    ValidationException,
} from '../../domain/exceptions/BaseException';

/**
 * MÓDULO DEL VENDEDOR — ATENCIÓN PRESENCIAL. El flujo completo, de la apertura al
 * cierre.
 *
 * Qué NO hace este archivo, a propósito:
 *  - NO reimplementa el dedupe: llama a `ingestarConsulta` (el camino común de los
 *    4 canales). Un cliente que consultó por Instagram y después viene al salón
 *    tiene que ser LA MISMA ficha, y eso sólo se garantiza si el mostrador entra
 *    por la misma puerta que las redes (criterio de aceptación 2).
 *  - NO reimplementa las reglas de sugerencia: arma el stock ya filtrado y se lo
 *    pasa al motor PURO (`domain/services/sugerenciasVehiculo`), que decide. Las
 *    reglas se testean sin base; acá sólo vive el I/O.
 *  - NO duplica entidades que ya existen: el próximo contacto del cierre es un
 *    `ClienteSeguimiento` (cae solo en /seguimientos y en la campanita), la
 *    permuta es una `Tasacion` vinculada a la atención, y la reserva/cotización
 *    se ENLAZAN por lectura, no se vuelven a crear.
 *  - NO calcula la retención de la asignación ni la config del tenant: eso lo
 *    resuelve `carteraCliente`, el mismo módulo que recorta el listado de
 *    clientes, el CSV y el buscador global. Dos implementaciones del mismo plazo
 *    darían dos veredictos distintos sobre el mismo cliente en dos pantallas.
 *  - NO cierra las atenciones de fin de día: eso lo hace el worker
 *    `infrastructure/atencion/cierreDiarioWorker`, que además es el que cuenta la
 *    alerta que consume la campanita. Acá sólo se lee.
 *
 * SEPARACIÓN VENDEDOR / ADMINISTRACIÓN (criterio de aceptación 7): ninguna
 * consulta de este archivo selecciona `precioCompra`, `precioMinimo`,
 * `proveedorCompraId`, `formaPagoCompra` ni `fechaCompra`. No se sanitiza
 * después: no se traen. Ver `UNIDAD_SELECT`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// ERRORES DE DOMINIO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El cliente está asignado a otro vendedor y la asignación sigue vigente. Es un
 * AVISO, no una prohibición: el flujo deja atender igual si el vendedor confirma
 * (y entonces la atención registra quién lo atendió REALMENTE). La reasignación
 * —esa sí— la autoriza un admin.
 */
export class ClienteAsignadoAOtroVendedorError extends BaseException {
    constructor(clienteId: number, aviso: AvisoAsignacion) {
        super(
            409,
            aviso.mensaje ?? 'Este cliente está asignado a otro vendedor.',
            'CLIENTE_ASIGNADO_A_OTRO_VENDEDOR',
        );
        this.details = { clienteId, ...aviso };
    }
}

/** Ley 25.326: sin consentimiento no se guardan ni se usan datos de contacto. */
export class ConsentimientoRequeridoError extends BaseException {
    constructor(mensaje: string) {
        super(409, mensaje, 'CONSENTIMIENTO_REQUERIDO');
    }
}

/** Enriquecimiento progresivo: recién al aparecer interés real se exigen los datos. */
export class DatosDelClienteRequeridosError extends BaseException {
    constructor(faltantes: string[], mensaje: string) {
        super(409, mensaje, 'DATOS_CLIENTE_REQUERIDOS');
        this.details = { faltantes };
    }
}

/** Una atención cerrada no se sigue trabajando: si el cliente vuelve, se abre otra. */
export class AtencionCerradaError extends BaseException {
    constructor(id: number) {
        super(409, `La atención #${id} ya está cerrada. Si el cliente volvió, abrí una atención nueva.`, 'ATENCION_CERRADA');
    }
}

/** Criterio de aceptación 6, primera mitad. */
export class ResultadoRequeridoError extends BaseException {
    constructor() {
        super(
            409,
            'No se puede cerrar una atención sin resultado. Elegí uno: reserva, cotizacion, test_drive, permuta_a_tasar, en_analisis, sin_unidad o se_retiro.',
            'RESULTADO_REQUERIDO',
        );
    }
}

/** Criterio de aceptación 6, segunda mitad. */
export class ProximoContactoRequeridoError extends BaseException {
    constructor(resultado: string) {
        super(
            409,
            `El resultado "${resultado}" no es definitivo: para cerrar hace falta el próximo contacto (fecha y medio). Queda agendado como seguimiento del cliente.`,
            'PROXIMO_CONTACTO_REQUERIDO',
        );
        this.details = { resultado, requeridos: ['proximoContacto', 'medioProximoContacto'] };
    }
}

/** Decisión del dueño, configurable por tenant: en algunas casas sólo tasa el tasador. */
export class TasacionSoloTasadorError extends BaseException {
    constructor() {
        super(
            403,
            'En esta concesionaria el valor de toma lo carga el tasador. Registrá la permuta sin valor: queda en "sin tasar" y el tasador la completa.',
            'TASACION_SOLO_TASADOR',
        );
    }
}

/** El flujo del salón necesita un usuario DE la concesionaria (super_admin no atiende). */
export class SinConcesionariaError extends BaseException {
    constructor() {
        super(
            400,
            'La atención presencial la abre un usuario de la concesionaria. La cuenta de plataforma (super_admin) no tiene salón donde atender.',
            'SIN_CONCESIONARIA',
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE NEGOCIO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Acciones que son INTERÉS REAL. Recién acá el sistema exige DNI, email,
 * domicilio y consentimiento (paso 2 del flujo). `vista` NO está: mirar un auto
 * en la playa no puede costar un formulario, y eso es justo lo que el encargo
 * prohíbe ("nunca bloquear el avance por falta de datos").
 */
export const ACCIONES_DE_INTERES_REAL = ['test_drive', 'cotizada', 'reservada'] as const;

/**
 * Resultados que CIERRAN el círculo y no exigen próximo contacto.
 *
 * `reserva`: ya tomó la seña, el seguimiento pasa a ser la entrega (otro flujo).
 * `sin_unidad`: no hay nada en el stock que le sirva; agendar una llamada sería
 * agendar mentira hasta que entre otra unidad.
 *
 * TODO LO DEMÁS exige próximo contacto, incluidas `cotizacion` y `test_drive`:
 * una cotización entregada sin decisión es exactamente el caso donde la venta se
 * pierde por no volver a llamar. Está en una constante para que el dueño pueda
 * moverlo sin buscar la regla adentro de un if.
 */
export const RESULTADOS_DEFINITIVOS = ['reserva', 'sin_unidad'] as const;

/** Escalera de la acción: mostrar otra vez la misma unidad SUBE, nunca baja. */
const ORDEN_ACCION: Record<string, number> = { vista: 0, test_drive: 1, cotizada: 2, reservada: 3 };

/**
 * Topes defensivos. Ninguna concesionaria real los toca (un stock vivo de 1000
 * unidades es enorme), pero un findMany sin techo es un problema esperando.
 */
const TOPE_STOCK = 1000;
/**
 * Cuántas unidades NO disponibles del modelo buscado se traen para poder informar
 * su estado ("hay dos, una vendida y una en preparación"). Es un tope chico a
 * propósito: no alimenta ninguna sugerencia —el motor vuelve a filtrar por
 * disponibilidad— y con el histórico entero el texto de `estadoDeLaExacta`
 * terminaba concatenando el estado de mil unidades vendidas.
 */
const TOPE_ESTADO_DEL_MODELO = 20;
const TOPE_HISTORIAL_ATENCIONES = 20;
const TOPE_UNIDADES_MOSTRADAS = 300;

const DIA_MS = 86400000;

/**
 * Sin teléfono el dedupe no tiene por dónde agarrar: no se bloquea la apertura
 * (eso violaría "nunca bloquear el avance por falta de datos") pero SÍ se avisa,
 * porque el duplicado que aparece después es silencioso.
 */
const AVISO_SIN_TELEFONO =
    'La atención se abrió sin teléfono: sin ese dato el sistema no puede evitar que el cliente quede duplicado si ya consultó por redes. Pedíselo apenas puedas.';

/**
 * Lo que el vendedor VE de una unidad: precio de LISTA, características, estado,
 * ubicación física y antigüedad en stock.
 *
 * Lo que NO está y NO se agrega: `precioCompra`, `precioMinimo` (el piso
 * autorizado, que requiere autorización por sistema), `proveedorCompraId`,
 * `formaPagoCompra` y `fechaCompra`. El criterio de aceptación 7 dice "por
 * ninguna vía, INCLUIDA LA API": la forma de garantizarlo es no traer el dato,
 * no borrarlo después.
 */
const UNIDAD_SELECT = {
    id: true,
    marca: true,
    modelo: true,
    version: true,
    anio: true,
    dominio: true,
    vin: true,
    color: true,
    estado: true,
    tipo: true,
    kmIngreso: true,
    precioLista: true,
    moneda: true,
    segmento: true,
    fechaIngreso: true,
    sucursalId: true,
    sucursal: { select: { id: true, nombre: true } },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE ENTRADA / SALIDA
// ─────────────────────────────────────────────────────────────────────────────

export interface DatosIdentificacion {
    nombre?: string;
    telefono?: string;
    dni?: string;
    email?: string;
}

export interface DatosApertura extends DatosIdentificacion {
    nombre: string;
    apellido?: string;
    motivo?: 'consulta_general' | 'unidad_puntual' | 'vuelve_por_atencion_anterior';
    atencionAnteriorId?: number;
    observaciones?: string;
    confirmaAtenderAjeno?: boolean;
}

export interface ParamsBusquedaHttp {
    modo: ModoBusqueda;
    dominio?: string;
    vin?: string;
    vehiculoId?: number;
    marca?: string;
    modelo?: string;
    version?: string;
    anio?: number;
    presupuestoMin?: number;
    presupuestoMax?: number;
    anticipo?: number;
    cuotaMaxima?: number;
    tipoFinanciamiento?: 'contado' | 'credito' | 'plan_de_ahorro';
    moneda?: 'ARS' | 'USD';
    incluirYaMostradas?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** El tenant del salón. Sin esto no hay atención presencial que valga. */
const tenantObligatorio = (): number => {
    // El super_admin se corta ACÁ y no por "no tiene tenant en contexto": su token
    // PUEDE traer una concesionaria (el seed se la pone), así que mirar sólo el
    // tenant lo dejaba pasar — y después `prisma.cliente.create()` reventaba con un
    // 500 ("Argument `concesionaria` is missing"), porque la extensión de Prisma no
    // le inyecta el tenant a la cuenta de plataforma. Es la misma respuesta que la
    // clase ya prometía, pero ahora sí se dispara.
    if (actorEsSuperAdmin()) throw new SinConcesionariaError();
    const id = context.getTenantId();
    if (!id) throw new SinConcesionariaError();
    return id;
};

/** Decimal de Prisma → number. `null`/undefined se preservan. */
const num = (v: Prisma.Decimal | number | null | undefined): number | null =>
    v === null || v === undefined ? null : Number(v);

/** Medianoche UTC del día: es lo que espera una columna `@db.Date`. */
const aFechaDia = (v: Date | string): Date => {
    const d = typeof v === 'string' ? new Date(v) : v;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const esInteresReal = (accion: string): boolean =>
    (ACCIONES_DE_INTERES_REAL as readonly string[]).includes(accion);

/**
 * Marca el contacto REAL con el cliente. Es el reloj contra el que se mide la
 * retención de la asignación, así que se toca SÓLO cuando pasó algo de verdad
 * (se abrió una atención, se registró interés, se cerró la visita) y nunca por
 * una edición administrativa de la ficha — para eso ya está `updatedAt`.
 *
 * Es un alias de `carteraCliente.tocarUltimaInteraccion` y NO una segunda
 * implementación: acá vivía una copia privada, y el módulo compartido —el que
 * documenta la regla y el que usan los otros canales— había quedado sin un solo
 * llamador. Con dos implementaciones, el día que cambie el criterio divergen.
 */
const marcarInteraccion = tocarUltimaInteraccion;

/**
 * ¿Hay que avisar antes de abrir? Sólo cuando el cliente es de OTRO vendedor y la
 * retención sigue vigente: si venció, el cliente quedó libre y quien lo atiende
 * hoy no necesita permiso de nadie.
 *
 * La regla de retención NO se calcula acá: la resuelve `carteraCliente`, que es
 * la misma que recorta el listado de clientes, el CSV y el buscador global. Dos
 * implementaciones del mismo plazo darían dos veredictos distintos sobre el mismo
 * cliente en dos pantallas del mismo producto.
 */
async function avisoQueBloquea(cliente: ClienteParaAviso | null | undefined): Promise<AvisoAsignacion | null> {
    const aviso = await avisoDeAsignacion(cliente);
    return aviso.esDeOtroVendedor && !aviso.retencionVencida ? aviso : null;
}

/**
 * Recorte de visibilidad del vendedor puro: sus atenciones o las de sus clientes
 * asignados. Null = ve todo el tenant (admin). Mismo patrón que
 * `ReporteController.consultas`.
 */
const filtroVendedor = (): Prisma.AtencionWhereInput | null => {
    if (!actorEsVendedorPuro()) return null;
    const id = actorUserId();
    return { OR: [{ vendedorId: id }, { cliente: { vendedorAsignadoId: id } }] };
};

/**
 * Carga la atención y aplica el recorte por vendedor. Un vendedor puro no puede
 * ni leer ni operar la atención de otro: si no es suya, es un 404 (no un 403) —
 * decirle "existe pero no es tuya" ya filtra que ese cliente pasó por el salón.
 */
async function cargarAtencion(id: number) {
    const atencion = await prisma.atencion.findFirst({
        where: { id, ...(filtroVendedor() ?? {}) },
        include: {
            cliente: { include: { vendedorAsignado: { select: { id: true, nombre: true } } } },
            vendedor: { select: { id: true, nombre: true } },
        },
    });
    if (!atencion) throw new NotFoundException('Atención');
    return atencion;
}

/** Igual que `cargarAtencion` pero exigiendo que siga abierta (todo el flujo la necesita así). */
async function cargarAtencionAbierta(id: number) {
    const atencion = await cargarAtencion(id);
    if (atencion.estado === 'cerrada') throw new AtencionCerradaError(atencion.id);
    return atencion;
}

/**
 * ENRIQUECIMIENTO PROGRESIVO — el punto donde el sistema SÍ exige.
 *
 * Un solo error con TODO lo que falta (y no uno por campo): el vendedor está
 * parado delante del cliente, no puede descubrir el formulario de a un round-trip.
 */
export function exigirDatosParaInteresReal(
    cliente: { dni: string | null; email: string | null; direccion: string | null; consentimientoContacto: boolean },
    queSeIntenta: string,
): void {
    const faltantes: string[] = [];
    if (!cliente.dni?.trim()) faltantes.push('dni');
    if (!cliente.email?.trim()) faltantes.push('email');
    if (!cliente.direccion?.trim()) faltantes.push('direccion');
    const sinConsentimiento = cliente.consentimientoContacto !== true;

    if (sinConsentimiento && faltantes.length === 0) {
        throw new ConsentimientoRequeridoError(
            `Para registrar "${queSeIntenta}" hace falta el consentimiento de contacto del cliente (Ley 25.326 de Protección de Datos Personales). Pedíselo y cargalo en la ficha.`,
        );
    }
    if (faltantes.length > 0) {
        const todos = sinConsentimiento ? [...faltantes, 'consentimientoContacto'] : faltantes;
        const legibles = todos
            .map((f) => ({ dni: 'DNI', email: 'email', direccion: 'domicilio', consentimientoContacto: 'consentimiento de contacto (Ley 25.326)' }[f] ?? f))
            .join(', ');
        throw new DatosDelClienteRequeridosError(
            todos,
            `Para registrar "${queSeIntenta}" faltan datos del cliente: ${legibles}. Completalos y volvé a intentar.`,
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORIAL DEL CLIENTE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Si el cliente existe, recuperá su ficha CON el historial": atenciones previas,
 * unidades ya vistas y quién lo atendió antes.
 *
 * `completo=false` devuelve sólo el resumen. Se usa cuando un vendedor puro
 * identifica a un cliente que NO es suyo: para no duplicarlo necesita saber que
 * existe y de quién es (eso ES el aviso), pero el detalle de lo que otro vendedor
 * le mostró es información comercial ajena. Apenas abre la atención —y queda
 * registrado y auditado que la abrió— el historial completo sí viaja: si lo va a
 * atender, tiene que saber qué le mostraron.
 */
/**
 * ¿Este actor puede ver el historial COMPLETO de este cliente?
 *
 * Tres puertas, no una:
 *  1. no es vendedor puro (admin: ve todo),
 *  2. el cliente es suyo (o no es de nadie),
 *  3. YA LO ATENDIÓ — tiene una atención con él.
 *
 * La tercera es la que faltaba, y es la que hace verdadero lo que promete
 * `construirHistorial`: "apenas abre la atención, el historial completo sí viaja".
 * Sin ella, el vendedor que atiende un sábado a un cliente de otro abría la visita
 * y la pantalla le mostraba el panel "Ya vio antes" vacío — mientras el motor SÍ
 * conocía esas unidades y se las escondía de las sugerencias. Justo el caso que
 * el encargo contempla (cliente asignado a otro que vuelve al salón) era el único
 * en que el criterio de aceptación 8 no se cumplía.
 *
 * Es el MISMO criterio que `filtroVendedor()` ya usa para dejarlo entrar al
 * detalle de la atención: el sistema ya acepta que abrir la atención da acceso.
 * El barrido sobre clientes que nunca atendió sigue cerrado.
 */
async function puedeVerHistorialCompleto(cliente: { id: number; vendedorAsignadoId: number | null }): Promise<boolean> {
    if (!actorEsVendedorPuro()) return true;
    const yo = actorUserId();
    if (!cliente.vendedorAsignadoId || cliente.vendedorAsignadoId === yo) return true;
    const propias = await prisma.atencion.count({ where: { clienteId: cliente.id, vendedorId: yo } });
    return propias > 0;
}

export async function construirHistorial(clienteId: number, completo: boolean) {
    const [atenciones, total] = await Promise.all([
        prisma.atencion.findMany({
            where: { clienteId },
            orderBy: { iniciadaEn: 'desc' },
            take: TOPE_HISTORIAL_ATENCIONES,
            select: {
                id: true,
                iniciadaEn: true,
                cerradaEn: true,
                estado: true,
                motivo: true,
                resultado: true,
                cerradaAutomaticamente: true,
                observaciones: completo,
                vendedor: { select: { id: true, nombre: true } },
            },
        }),
        prisma.atencion.count({ where: { clienteId } }),
    ]);

    // "Quién lo atendió antes": los vendedores que ya lo trabajaron, del más
    // reciente al más viejo. Se deriva de las atenciones ya traídas (no hay
    // groupBy con include en Prisma y no vale otra vuelta a la base por esto).
    const vistos = new Set<number>();
    const vendedoresPrevios: Array<{ id: number; nombre: string }> = [];
    for (const a of atenciones) {
        if (!a.vendedor || vistos.has(a.vendedor.id)) continue;
        vistos.add(a.vendedor.id);
        vendedoresPrevios.push({ id: a.vendedor.id, nombre: a.vendedor.nombre });
    }

    if (!completo) {
        return {
            restringido: true,
            totalAtenciones: total,
            ultimaAtencion: atenciones[0] ? { id: atenciones[0].id, iniciadaEn: atenciones[0].iniciadaEn, estado: atenciones[0].estado } : null,
            vendedoresPrevios,
            atenciones: [],
            unidadesVistas: [],
        };
    }

    // Unidades ya mostradas, de todas las visitas. `atencion.deletedAt: null` va
    // a mano: la extensión filtra el modelo raíz, no los filtros anidados.
    const mostradas = await prisma.atencionVehiculo.findMany({
        where: { atencion: { clienteId, deletedAt: null } },
        orderBy: { id: 'desc' },
        take: TOPE_UNIDADES_MOSTRADAS,
        select: {
            id: true,
            atencionId: true,
            tipo: true,
            accion: true,
            nivelInteres: true,
            motivoSugerencia: true,
            createdAt: true,
            vehiculo: { select: UNIDAD_SELECT },
        },
    });

    return {
        restringido: false,
        totalAtenciones: total,
        ultimaAtencion: atenciones[0] ?? null,
        vendedoresPrevios,
        atenciones,
        unidadesVistas: mostradas,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 1 — IDENTIFICAR Y ABRIR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PASO 1a. Corre el dedupe y devuelve la ficha con su historial y el aviso de
 * asignación. NO PERSISTE NADA: es lo que el vendedor mira antes de decidir si
 * abre la atención.
 */
export async function identificarCliente(datos: DatosIdentificacion) {
    tenantObligatorio();

    const encontrado = await buscarClientePorContacto({
        telefono: datos.telefono ?? null,
        dni: datos.dni ?? null,
        email: datos.email ?? null,
    });

    if (!encontrado) {
        return {
            cliente: null,
            historial: null,
            aviso: null,
            avisos: datos.telefono ? [] : [AVISO_SIN_TELEFONO],
        };
    }

    const cliente = await prisma.cliente.findFirst({
        where: { id: encontrado.id },
        include: { vendedorAsignado: { select: { id: true, nombre: true } } },
    });
    if (!cliente) throw new NotFoundException('Cliente');

    const aviso = await avisoQueBloquea(cliente);

    // Un vendedor puro ve el detalle si el cliente es suyo, si nadie lo reclama o
    // si ya lo atendió alguna vez. Ver `puedeVerHistorialCompleto`.
    const historial = await construirHistorial(cliente.id, await puedeVerHistorialCompleto(cliente));

    return { cliente: sanitizarCliente(cliente), historial, aviso, avisos: datos.telefono ? [] : [AVISO_SIN_TELEFONO] };
}

/**
 * La ficha que ve el vendedor. `observaciones` queda afuera para el vendedor puro
 * que no es dueño del cliente: ahí se acumulan las líneas de todas las consultas
 * de todos los canales, que es la estrategia comercial de otro.
 */
function sanitizarCliente<T extends { observaciones?: string | null; vendedorAsignadoId: number | null }>(cliente: T): T {
    if (!actorEsVendedorPuro()) return cliente;
    if (cliente.vendedorAsignadoId === actorUserId()) return cliente;
    return { ...cliente, observaciones: null };
}

/**
 * PASO 1b. Abre la atención con lo mínimo: nombre (y teléfono, si lo da).
 *
 * ORDEN, y el motivo: primero se busca el cliente y se calcula el aviso, DESPUÉS
 * se escribe. Si el cliente es de otro vendedor y el que atiende no confirmó, esto
 * tira 409 sin haber creado ni tocado nada — que es lo que pide el encargo
 * ("el sistema AVISA antes de abrir la atención").
 */
export async function abrirAtencion(datos: DatosApertura) {
    const tenantId = tenantObligatorio();
    const vendedorQueAtiende = actorUserId();
    // El vendedor de la atención se estampa del token, nunca del body. Y tiene que
    // ser un usuario de ESTA concesionaria: la RLS valida el tenant de la fila que
    // se escribe, no el de sus FKs (la integridad referencial de Postgres saltea
    // RLS por diseño), así que sin este chequeo la atención podía quedar atada a
    // un usuario que para este tenant no existe.
    await assertMismoTenant('usuario', vendedorQueAtiende, tenantId);

    // 1. ¿Existe? (dedupe compartido: teléfono normalizado → DNI → email)
    const previo = await buscarClientePorContacto({
        telefono: datos.telefono ?? null,
        dni: datos.dni ?? null,
        email: datos.email ?? null,
    });

    let aviso: AvisoAsignacion | null = null;
    if (previo) {
        const conVendedor = await prisma.cliente.findFirst({
            where: { id: previo.id },
            include: { vendedorAsignado: { select: { id: true, nombre: true } } },
        });
        if (conVendedor) aviso = await avisoQueBloquea(conVendedor);
        if (aviso && datos.confirmaAtenderAjeno !== true) {
            throw new ClienteAsignadoAOtroVendedorError(previo.id, aviso);
        }
    }

    // 2. Alta o recuperación del cliente POR EL CAMINO COMÚN. `vendedorId` sólo
    //    se aplica si el cliente no tiene dueño: `ingestarConsulta` NUNCA le roba
    //    la ficha al vendedor asignado (respeta `existente.vendedorAsignadoId`).
    const ingesta = await ingestarConsulta({
        origen: 'mostrador',
        nombre: datos.nombre,
        telefono: datos.telefono ?? null,
        dni: datos.dni ?? null,
        email: datos.email ?? null,
        vendedorId: vendedorQueAtiende,
        texto: `Atención presencial en el salón (motivo: ${datos.motivo ?? 'consulta_general'}).`,
    });

    // 3. Datos que la ingesta no escribe y sí tenemos acá.
    const ahora = new Date();
    const parche: Prisma.ClienteUpdateInput = { ultimaInteraccionEn: ahora };
    const clienteActual = await prisma.cliente.findFirst({ where: { id: ingesta.clienteId } });
    if (!clienteActual) throw new NotFoundException('Cliente');

    // El apellido nunca se pisa: si la ficha ya tiene uno cargado, el que tipeó
    // el vendedor apurado en el mostrador no puede ganarle.
    if (datos.apellido && !clienteActual.apellido) parche.apellido = datos.apellido;
    // La asignación cambió de manos (o se estrenó): queda la fecha, que es
    // auditoría de la cartera.
    if (clienteActual.vendedorAsignadoId && clienteActual.vendedorAsignadoId !== previo?.vendedorAsignadoId) {
        parche.vendedorAsignadoEn = ahora;
    }
    // Forma canónica del teléfono. El dedupe de hoy la calcula al consultar, así
    // que esto no cambia su resultado; mantiene la columna del schema en sintonía
    // con lo que se guardó, que es lo que va a usar el índice el día que la
    // cartera crezca y la comparación pase a ser por igualdad.
    const canonico = normalizarTelefono(datos.telefono ?? clienteActual.telefono);
    if (canonico && clienteActual.telefonoNormalizado !== canonico) parche.telefonoNormalizado = canonico;

    await prisma.cliente.update({ where: { id: clienteActual.id }, data: parche });

    // 4. La atención. `atencionAnteriorId` sólo si es del mismo cliente: si no,
    //    el "vuelve por una atención anterior" quedaría apuntando a la visita de
    //    otra persona.
    let atencionAnteriorId: number | null = null;
    if (datos.atencionAnteriorId) {
        const anterior = await prisma.atencion.findFirst({
            where: { id: datos.atencionAnteriorId, clienteId: clienteActual.id },
            select: { id: true },
        });
        if (!anterior) throw new ValidationException(
            [{ campo: 'atencionAnteriorId', mensaje: 'La atención anterior no existe o es de otro cliente' }],
            'La atención anterior no existe o es de otro cliente',
        );
        atencionAnteriorId = anterior.id;
    }

    const observaciones = [
        datos.observaciones?.trim() || null,
        // "registra quién lo atendió REALMENTE": el FK `vendedorId` ya lo dice,
        // pero el motivo por el que lo atendió otro tiene que quedar en texto para
        // el supervisor que después mire la visita.
        aviso ? `Atendido por decisión del vendedor pese a estar asignado a ${aviso.vendedorAsignado ?? `#${aviso.vendedorAsignadoId}`} (retención de ${aviso.diasRetencion} días, vigente).` : null,
    ].filter(Boolean).join('\n') || null;

    const atencion = await prisma.atencion.create({
        data: {
            concesionariaId: tenantId,
            clienteId: clienteActual.id,
            vendedorId: vendedorQueAtiende,
            canal: 'presencial',
            motivo: datos.motivo ?? 'consulta_general',
            atencionAnteriorId,
            estado: 'abierta',
            iniciadaEn: ahora,
            observaciones,
        } as never,
    });

    await audit({
        entidad: 'Atencion',
        accion: 'create',
        entidadId: atencion.id,
        detalle: `Atención presencial del cliente ${clienteActual.id}${aviso ? ' (cliente asignado a otro vendedor)' : ''}`,
    });

    const historial = await construirHistorial(clienteActual.id, true);
    const avisos: string[] = [];
    if (!datos.telefono) avisos.push(AVISO_SIN_TELEFONO);
    if (ingesta.reabierto) avisos.push('El cliente estaba dado por ganado o perdido: el lead se reabrió.');

    return {
        atencion,
        cliente: await prisma.cliente.findFirst({ where: { id: clienteActual.id }, include: { vendedorAsignado: { select: { id: true, nombre: true } } } }),
        clienteEsNuevo: ingesta.creado,
        aviso,
        avisos,
        historial,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 2 — ENRIQUECIMIENTO PROGRESIVO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Completa los datos del cliente desde la atención en curso.
 *
 * Ley 25.326: SIN CONSENTIMIENTO NO SE GUARDAN DATOS DE CONTACTO NUEVOS. El
 * teléfono con el que se abrió la visita no cae acá (lo dio el titular en el
 * mostrador para ser atendido); lo que este candado frena es CARGARLE MÁS datos
 * de contacto a una ficha sin que el titular haya prestado conformidad.
 *
 * Si algún día se valida el DNI contra RENAPER/SID, el punto de integración es
 * ACÁ (al completar los datos), no al abrir la atención.
 */
export async function completarCliente(
    atencionId: number,
    datos: {
        nombre?: string;
        apellido?: string;
        dni?: string;
        email?: string;
        telefono?: string;
        direccion?: string;
        consentimientoContacto?: boolean;
    },
) {
    const atencion = await cargarAtencionAbierta(atencionId);
    const cliente = atencion.cliente;

    const traeContactoNuevo = Boolean(datos.email || datos.telefono || datos.direccion);
    const consiente = datos.consentimientoContacto === true || cliente.consentimientoContacto === true;
    if (traeContactoNuevo && !consiente) {
        throw new ConsentimientoRequeridoError(
            'No se pueden guardar datos de contacto sin el consentimiento del titular (Ley 25.326). Pedíselo y marcá el consentimiento junto con los datos.',
        );
    }

    const data: Prisma.ClienteUpdateInput = { ultimaInteraccionEn: new Date() };
    if (datos.nombre) data.nombre = datos.nombre;
    if (datos.apellido) data.apellido = datos.apellido;
    if (datos.dni) data.dni = datos.dni;
    if (datos.email) data.email = datos.email;
    if (datos.direccion) data.direccion = datos.direccion;
    if (datos.telefono) {
        data.telefono = datos.telefono;
        // La forma canónica se recalcula siempre que cambia el texto: si no, la
        // columna quedaría afirmando el teléfono viejo.
        data.telefonoNormalizado = normalizarTelefono(datos.telefono);
    }
    // El consentimiento se OTORGA. `false` no lo revoca desde acá: revocarlo es un
    // acto del titular que se registra en la ficha del cliente, no un descuido de
    // un checkbox en el mostrador.
    if (datos.consentimientoContacto === true && cliente.consentimientoContacto !== true) {
        data.consentimientoContacto = true;
        data.consentimientoEn = new Date();
    }

    const actualizado = await prisma.cliente.update({ where: { id: cliente.id }, data });
    await audit({
        entidad: 'Cliente',
        accion: 'update',
        entidadId: cliente.id,
        detalle: `Datos completados en la atención #${atencionId}${data.consentimientoContacto ? ' (consentimiento otorgado)' : ''}`,
    });
    return actualizado;
}

// ─────────────────────────────────────────────────────────────────────────────
// PASOS 3 y 4 — RELEVAMIENTO, BÚSQUEDA Y SUGERENCIAS
// ─────────────────────────────────────────────────────────────────────────────

type FilaUnidad = Prisma.VehiculoGetPayload<{ select: typeof UNIDAD_SELECT }>;

/** Fila del stock → lo que entiende el motor puro. */
function aUnidadCandidata(v: FilaUnidad): UnidadCandidata {
    const dias = v.fechaIngreso ? Math.floor((Date.now() - v.fechaIngreso.getTime()) / DIA_MS) : null;
    return {
        id: v.id,
        marca: v.marca,
        modelo: v.modelo,
        version: v.version,
        anio: v.anio,
        km: v.kmIngreso,
        precio: num(v.precioLista),
        moneda: v.moneda,
        estado: v.estado,
        diasEnStock: dias !== null && dias >= 0 ? dias : null,
        segmento: v.segmento,
        dominio: v.dominio,
        vin: v.vin,
        // No existe una numeración de stock aparte del id: el "N° de stock" con el
        // que el vendedor busca en el salón es el id de la unidad.
        numeroStock: String(v.id),
        // `fechaIngresoConfirmada` no se setea: hoy no hay estado "en tránsito" en
        // EstadoVehiculo, así que ninguna unidad cae en esa rama del motor.
    };
}

/**
 * `ESTADOS_DISPONIBLES` vive en el dominio como `readonly string[]` porque ese
 * módulo es PURO y no puede importar `@prisma/client`. Para usarlo en un `where`
 * hace falta el tipo del enum, y en vez de forzarlo con un cast se lo NARROWEA
 * contra el enum real: un estado que el dominio nombre y la base no tenga
 * (`transito`, por ejemplo) queda afuera del SQL en vez de explotar en runtime
 * con un `invalid input value for enum`.
 */
const ESTADOS_DISPONIBLES_DEL_ENUM: EstadoVehiculo[] = ESTADOS_DISPONIBLES.filter(
    (e): e is EstadoVehiculo => Object.prototype.hasOwnProperty.call(EstadoVehiculo, e),
);

/**
 * Ejecuta el relevamiento + la búsqueda y persiste lo relevado en la atención.
 *
 * El PRESUPUESTO REAL manda: si hay permuta tasada o anticipo, el techo del filtro
 * pasa a ser (valor de permuta + anticipo) y NO lo que el cliente dijo al entrar.
 */
export async function buscarUnidades(atencionId: number, params: ParamsBusquedaHttp) {
    const atencion = await cargarAtencionAbierta(atencionId);
    /*
     * La moneda NO se completa con la de la atención. `Atencion.moneda` tiene
     * default 'ARS' en la base, así que toda visita nace en pesos: completarla acá
     * dejaba `params.moneda` SIEMPRE definida y el motor no podía inferirla nunca.
     * En una concesionaria que publica los usados en dólares —lo normal en
     * Argentina— eso barría el stock entero y devolvía cero alternativas con un
     * aviso factualmente falso delante del cliente. Se pasa lo que el vendedor
     * eligió, o nada; el motor resuelve el resto (ver `resolverExacta`).
     *
     * `monedaDelRelevamiento` es la moneda EN LA QUE ESTÁN EXPRESADOS el rango, el
     * anticipo y el presupuesto real de la visita. En modo presupuesto es la que
     * el vendedor acaba de elegir JUNTO CON el rango (el selector vive con
     * "Desde"/"Hasta"): si se tomara la guardada, pasar de Pesos a Dólares en el
     * mismo formulario dejaría el rango nuevo rotulado con la moneda vieja y el
     * motor lo descartaría por "otra moneda". En los otros dos modos no hay
     * selector en pantalla, así que manda la que ya tenía la atención — que es la
     * de los importes guardados.
     */
    const esModoPresupuesto = params.modo === 'presupuesto';
    const monedaDelRelevamiento = (esModoPresupuesto ? params.moneda : undefined) ?? atencion.moneda ?? 'ARS';

    // --- 1. Permuta y financiamiento -----------------------------------------
    // Sólo la permuta de ESTA atención, y nunca una rechazada: un usado que la
    // casa no toma no es plata que el cliente tenga.
    const permuta = await prisma.tasacion.findFirst({
        where: { atencionId, estado: { not: 'rechazada' }, deletedAt: null },
        orderBy: { id: 'desc' },
        select: { id: true, valorEstimado: true, moneda: true, estado: true, marca: true, modelo: true },
    });
    // Una permuta en otra moneda no se suma al anticipo: convertirla exigiría una
    // cotización del día y un supuesto que el vendedor no puede auditar delante
    // del cliente. Se compara contra la moneda DEL RELEVAMIENTO, que es en la que
    // están el anticipo y el rango.
    const valorPermuta = permuta && permuta.moneda === monedaDelRelevamiento ? num(permuta.valorEstimado) : null;

    const anticipo = params.anticipo ?? num(atencion.anticipo);
    const cuotaMaxima = params.cuotaMaxima ?? num(atencion.cuotaMaxima);
    const tipoFinanciamiento = params.tipoFinanciamiento ?? atencion.tipoFinanciamiento ?? undefined;

    /*
     * EL RANGO: en modo `presupuesto` lo que hay en pantalla ES la verdad —los
     * inputs "Desde"/"Hasta" se renderizan en ese modo, así que borrarlos tiene
     * que borrar el techo—. Completarlo con lo guardado hacía que el vendedor no
     * tuviera NINGUNA forma de sacar un techo viejo desde la UI: el campo vacío
     * llega como undefined y volvía a caer en el valor de la atención.
     *
     * En los otros dos modos esos inputs no existen en pantalla, así que el rango
     * relevado SÍ se hereda: lo necesita el upsell del criterio 3 del modo modelo
     * ("un escalón arriba dentro del presupuesto") y el marcado de lo que lo
     * supera. Lo que ya NO hace es filtrar (ver `sugerir`).
     */
    const presupuestoDeclaradoMin = esModoPresupuesto
        ? params.presupuestoMin ?? null
        : params.presupuestoMin ?? num(atencion.presupuestoMin);
    const presupuestoDeclaradoMax = esModoPresupuesto
        ? params.presupuestoMax ?? null
        : params.presupuestoMax ?? num(atencion.presupuestoMax);

    const hayPlataReal = (valorPermuta ?? 0) > 0 || (anticipo ?? 0) > 0;
    const presupuestoReal = hayPlataReal ? calcularPresupuestoReal({ valorPermuta, anticipo }) : null;

    let maxEfectivo = presupuestoDeclaradoMax ?? undefined;
    let minEfectivo = presupuestoDeclaradoMin ?? undefined;
    if (presupuestoReal !== null && presupuestoReal > 0) {
        maxEfectivo = presupuestoReal;
        // Un mínimo declarado por encima del presupuesto real dejaría el rango
        // vacío y la búsqueda sin resultados por una contradicción del cliente.
        if (minEfectivo !== undefined && minEfectivo > presupuestoReal) minEfectivo = undefined;
    }

    // --- 2. La unidad puntual, con su estado REAL ----------------------------
    let unidadBuscada: UnidadCandidata | undefined;
    let unidadNoEncontrada = false;
    if (params.modo === 'unidad') {
        const or: Prisma.VehiculoWhereInput[] = [];
        if (params.vehiculoId) or.push({ id: params.vehiculoId });
        if (params.dominio) or.push({ dominio: { equals: params.dominio, mode: 'insensitive' } });
        if (params.vin) or.push({ vin: { equals: params.vin, mode: 'insensitive' } });
        const fila = or.length ? await prisma.vehiculo.findFirst({ where: { OR: or }, select: UNIDAD_SELECT }) : null;
        if (fila) unidadBuscada = aUnidadCandidata(fila);
        else unidadNoEncontrada = true;
    }

    // --- 3. El stock ---------------------------------------------------------
    /*
     * DOS CONSULTAS, y no una sola con un OR, a propósito.
     *
     * Lo que se necesita son dos conjuntos distintos: (a) el stock DISPONIBLE, que
     * es de donde salen las sugerencias, y (b) —sólo en modo modelo— las unidades
     * de ese modelo aunque NO estén disponibles, que el motor usa nada más que
     * para poder decir "hay dos, una vendida y una en preparación".
     *
     * Unidos en un `OR` con `take: 1000 ORDER BY id ASC`, el tope recortaba por
     * ids más BAJOS = filas más VIEJAS. Como al vender sólo se cambia el estado
     * (la fila no se borra), el histórico de una marca se acumula y le comía el
     * cupo a las publicadas de hoy, que tienen los ids más altos: una oficial con
     * 1.200 Volkswagen históricos y 40 publicados respondía "1000 unidades en
     * stock, ninguna disponible" con 40 autos en la playa. Separadas, el tope de
     * las disponibles sólo lo puede agotar stock vivo, y la rama de estado se
     * acota a lo último cargado, que es lo único que hace falta para informar.
     */
    const disponibles = await prisma.vehiculo.findMany({
        where: { estado: { in: ESTADOS_DISPONIBLES_DEL_ENUM } },
        select: UNIDAD_SELECT,
        orderBy: { id: 'asc' },
        take: TOPE_STOCK,
    });
    const porId = new Map<number, FilaUnidad>(disponibles.map((f) => [f.id, f]));

    if (params.modo === 'modelo') {
        const delModelo: Prisma.VehiculoWhereInput = {};
        if (params.marca) delModelo.marca = { equals: params.marca, mode: 'insensitive' };
        if (params.modelo) delModelo.modelo = { equals: params.modelo, mode: 'insensitive' };
        if (Object.keys(delModelo).length > 0) {
            const noDisponiblesDelModelo = await prisma.vehiculo.findMany({
                where: { ...delModelo, estado: { notIn: ESTADOS_DISPONIBLES_DEL_ENUM } },
                select: UNIDAD_SELECT,
                // Las últimas cargadas: el estado que hay que informar es el de las
                // unidades recientes, no el de las que se vendieron hace cinco años.
                orderBy: { id: 'desc' },
                take: TOPE_ESTADO_DEL_MODELO,
            });
            for (const f of noDisponiblesDelModelo) if (!porId.has(f.id)) porId.set(f.id, f);
        }
    }

    if (unidadBuscada && !porId.has(unidadBuscada.id)) {
        const fila = await prisma.vehiculo.findFirst({ where: { id: unidadBuscada.id }, select: UNIDAD_SELECT });
        if (fila) porId.set(fila.id, fila);
    }
    const stock = [...porId.values()].map(aUnidadCandidata);

    // --- 4. Lo ya mostrado a este cliente en visitas ANTERIORES --------------
    const yaMostradas = await unidadesYaMostradas(atencion.clienteId, atencion.id);

    // --- 5. El motor decide --------------------------------------------------
    const paramsMotor: ParamsBusqueda = {
        modo: params.modo,
        unidadBuscada,
        marca: params.marca,
        modelo: params.modelo,
        version: params.version,
        anio: params.anio,
        presupuestoMin: minEfectivo,
        presupuestoMax: maxEfectivo,
        // Sin fallback: si el vendedor no eligió moneda, la infiere el motor.
        moneda: params.moneda,
        monedaPresupuesto: monedaDelRelevamiento,
        incluirYaMostradas: params.incluirYaMostradas,
    };
    const resultado = sugerir(paramsMotor, stock, yaMostradas);
    // La moneda en la que se comparó DE VERDAD. En modo unidad/modelo la fija la
    // unidad encontrada, así que puede no ser la del relevamiento.
    const moneda = resultado.moneda;
    const rangoAplica = moneda === monedaDelRelevamiento;

    // --- 6. Se persiste el relevamiento --------------------------------------
    await prisma.atencion.update({
        where: { id: atencion.id },
        data: {
            modoBusqueda: params.modo,
            presupuestoMin: presupuestoDeclaradoMin ?? null,
            presupuestoMax: presupuestoDeclaradoMax ?? null,
            anticipo: anticipo ?? null,
            cuotaMaxima: cuotaMaxima ?? null,
            tipoFinanciamiento: tipoFinanciamiento ?? null,
            presupuestoRealCalculado: presupuestoReal,
            // `Atencion.moneda` es la moneda DEL RELEVAMIENTO, no la de esta
            // búsqueda: es la unidad de cuenta de los importes que se guardan en
            // las líneas de arriba. Pisarla con la moneda de la unidad que el
            // cliente fue a mirar (modo unidad/modelo) dejaría un techo en pesos
            // rotulado como dólares.
            moneda: monedaDelRelevamiento,
        },
    });

    // --- 7. Respuesta: la fila pública completa, no sólo lo que vio el motor --
    const conFila = (u: UnidadCandidata) => porId.get(u.id) ?? u;
    const alternativas = resultado.alternativas.map((s: Sugerencia) => ({
        unidad: conFila(s.unidad),
        motivo: s.motivo,
        porEncimaDelMaximo: s.porEncimaDelMaximo === true,
    }));

    return {
        relevamiento: {
            modo: params.modo,
            moneda,
            monedaDelRelevamiento,
            presupuestoDeclaradoMin,
            presupuestoDeclaradoMax,
            presupuestoRealCalculado: presupuestoReal,
            // El techo con el que se filtró DE VERDAD. En modo unidad/modelo no
            // filtra (sólo marca), y si la comparación terminó en otra moneda que
            // la del relevamiento, no aplica en absoluto: decir "se filtró con X"
            // cuando X no se usó es lo mismo que mentir.
            presupuestoQueMandaElFiltro: rangoAplica ? maxEfectivo ?? null : null,
            presupuestoFiltra: params.modo === 'presupuesto' && rangoAplica,
            rangoIgnoradoPorMoneda: !rangoAplica && maxEfectivo !== undefined,
            origenDelFiltro: presupuestoReal !== null ? 'permuta + anticipo' : 'declarado por el cliente',
            anticipo,
            cuotaMaxima,
            tipoFinanciamiento: tipoFinanciamiento ?? null,
            permuta: permuta ? { id: permuta.id, estado: permuta.estado, valorEstimado: num(permuta.valorEstimado), moneda: permuta.moneda, unidad: `${permuta.marca} ${permuta.modelo}` } : null,
        },
        exacta: resultado.exacta ? conFila(resultado.exacta) : null,
        exactaPorEncimaDelMaximo: resultado.exactaPorEncimaDelMaximo === true,
        estadoDeLaExacta: resultado.estadoDeLaExacta ?? null,
        alternativas,
        aviso: unidadNoEncontrada
            ? 'No encontramos ninguna unidad con esa patente, VIN o N° de stock. Revisá el dato o buscá por modelo.'
            : resultado.aviso ?? null,
        // La cuota máxima se registra pero NO se convierte en capital: la tasa y el
        // plazo los define la financiera, y estimar acá un monto financiable sería
        // prometerle al cliente un número que después no le dan.
        notaFinanciamiento:
            cuotaMaxima && (tipoFinanciamiento === 'credito' || tipoFinanciamiento === 'plan_de_ahorro')
                ? `La cuota máxima declarada queda registrada para la solicitud de financiación. El filtro se hizo con lo que el cliente puede poner hoy (permuta + anticipo): el monto financiable lo define la financiera.`
                : null,
    };
}

/**
 * Unidades que ya se le mostraron a este cliente en visitas anteriores, con el
 * precio que tenían EN ESE MOMENTO.
 *
 * El precio histórico sale de `VehiculoPrecioHistorial`: el primer cambio de
 * precio POSTERIOR a la fecha en que se la mostramos guarda, en `precioAnterior`,
 * exactamente el precio que estaba vigente ese día. Si no hubo ningún cambio
 * desde entonces, el precio de hoy es el mismo de entonces — y como el motor sólo
 * repite una unidad que BAJÓ, con eso queda correctamente excluida.
 */
async function unidadesYaMostradas(clienteId: number, atencionActualId: number): Promise<UnidadYaMostrada[]> {
    const previas = await prisma.atencionVehiculo.findMany({
        where: { atencion: { clienteId, deletedAt: null, id: { not: atencionActualId } } },
        select: { vehiculoId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: TOPE_UNIDADES_MOSTRADAS,
    });
    if (previas.length === 0) return [];

    // La última vez que se la mostramos es la que importa: la pregunta es si bajó
    // DESDE ENTONCES, no desde la primera vez.
    const ultimaVez = new Map<number, Date>();
    for (const p of previas) if (!ultimaVez.has(p.vehiculoId)) ultimaVez.set(p.vehiculoId, p.createdAt);

    const ids = [...ultimaVez.keys()];
    const [cambios, actuales] = await Promise.all([
        prisma.vehiculoPrecioHistorial.findMany({
            where: { vehiculoId: { in: ids } },
            select: { vehiculoId: true, precioAnterior: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.vehiculo.findMany({ where: { id: { in: ids } }, select: { id: true, precioLista: true } }),
    ]);
    const precioHoy = new Map(actuales.map((v) => [v.id, num(v.precioLista)]));

    return ids.map((vehiculoId) => {
        const desde = ultimaVez.get(vehiculoId)!;
        const primerCambio = cambios.find((c) => c.vehiculoId === vehiculoId && c.createdAt > desde);
        const precioAlMostrar = primerCambio ? num(primerCambio.precioAnterior) : precioHoy.get(vehiculoId) ?? null;
        return { vehiculoId, precioAlMostrar };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 5 — REGISTRO DE LO MOSTRADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra una unidad mostrada en ESTA visita, con si fue buscada o sugerida, qué
 * se hizo con ella y el motivo que mostró el sistema.
 *
 * Dentro de la misma visita la unidad es UNA fila: volver a mostrarla SUBE la
 * acción (vista → test_drive → cotizada → reservada) y nunca la baja — si el
 * cliente ya hizo el test drive, registrar después "vista" no puede borrar que lo
 * hizo. La repetición legítima es entre visitas distintas, y el `@@unique` la
 * permite.
 */
export async function registrarVehiculoMostrado(
    atencionId: number,
    datos: {
        vehiculoId: number;
        tipo: 'buscada' | 'sugerida';
        accion?: 'vista' | 'test_drive' | 'cotizada' | 'reservada';
        nivelInteres?: 'bajo' | 'medio' | 'alto';
        motivoSugerencia?: string;
    },
) {
    const atencion = await cargarAtencionAbierta(atencionId);
    const accion = datos.accion ?? 'vista';

    if (esInteresReal(accion)) {
        exigirDatosParaInteresReal(atencion.cliente, accion === 'test_drive' ? 'test drive' : accion);
    }

    // La unidad tiene que existir Y ser de este tenant (la extensión ya filtra por
    // tenant; el findFirst devuelve null para una de otra concesionaria).
    const vehiculo = await prisma.vehiculo.findFirst({ where: { id: datos.vehiculoId }, select: UNIDAD_SELECT });
    if (!vehiculo) throw new NotFoundException('Vehículo');

    const existente = await prisma.atencionVehiculo.findFirst({
        where: { atencionId: atencion.id, vehiculoId: datos.vehiculoId },
    });

    const accionFinal =
        existente && (ORDEN_ACCION[existente.accion] ?? 0) > (ORDEN_ACCION[accion] ?? 0)
            ? existente.accion
            : accion;

    const fila = existente
        ? await prisma.atencionVehiculo.update({
            where: { id: existente.id },
            data: {
                accion: accionFinal,
                nivelInteres: datos.nivelInteres ?? existente.nivelInteres,
                // El motivo de la sugerencia se conserva: si la unidad entró
                // sugerida y después el cliente la pidió, POR QUÉ se la mostramos
                // sigue siendo lo que explica la visita.
                motivoSugerencia: existente.motivoSugerencia ?? datos.motivoSugerencia ?? null,
                tipo: existente.tipo === 'buscada' ? 'buscada' : datos.tipo,
            },
        })
        : await prisma.atencionVehiculo.create({
            data: {
                atencionId: atencion.id,
                vehiculoId: datos.vehiculoId,
                tipo: datos.tipo,
                accion: accionFinal,
                nivelInteres: datos.nivelInteres ?? null,
                motivoSugerencia: datos.motivoSugerencia ?? null,
            } as never,
        });

    // Upsert del AGREGADO cliente↔vehículo: es lo que alimenta la pestaña
    // "Interesados" del vehículo y la pestaña "Interés" del cliente, que existen
    // desde antes de este módulo. Sin esto, el detalle por visita quedaría en una
    // tabla que ninguna pantalla actual mira.
    await prisma.vehiculoInteres.upsert({
        where: { clienteId_vehiculoId: { clienteId: atencion.clienteId, vehiculoId: datos.vehiculoId } },
        update: { nota: `Atención #${atencion.id}: ${accionFinal}` },
        create: { clienteId: atencion.clienteId, vehiculoId: datos.vehiculoId, nota: `Atención #${atencion.id}: ${accionFinal}` } as never,
    });

    await marcarInteraccion(atencion.clienteId);
    await audit({
        entidad: 'AtencionVehiculo',
        accion: existente ? 'update' : 'create',
        entidadId: fila.id,
        detalle: `Unidad ${datos.vehiculoId} (${datos.tipo}, ${accionFinal}) en la atención #${atencion.id}`,
    });

    return { ...fila, vehiculo };
}

// ─────────────────────────────────────────────────────────────────────────────
// PERMUTA (se materializa como Tasacion vinculada a la atención)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea o actualiza la permuta de la atención.
 *
 * Configurable por concesionaria (`tasacionSoloTasador`): donde sólo tasa el
 * tasador, el vendedor puede cargar el usado —eso es dato del cliente— pero no
 * ponerle valor; la tasación queda `sin_tasar` y la completa quien corresponda.
 */
export async function registrarPermuta(
    atencionId: number,
    datos: {
        marca: string;
        modelo: string;
        anio?: number;
        km?: number;
        dominio?: string;
        condicion?: 'excelente' | 'muy_bueno' | 'bueno' | 'regular' | 'malo';
        valorEstimado?: number;
        moneda?: 'ARS' | 'USD';
        estado?: 'sin_tasar' | 'tasada' | 'rechazada';
        observaciones?: string;
    },
) {
    const atencion = await cargarAtencionAbierta(atencionId);
    const tenantId = tenantObligatorio();

    // Ofrecer un usado en permuta ES interés real: acá el sistema sí exige.
    exigirDatosParaInteresReal(atencion.cliente, 'permuta');

    const { tasacionSoloTasador } = await configCartera();
    const puedeTasar = actorEsAdmin() || !tasacionSoloTasador;
    if (datos.valorEstimado !== undefined && !puedeTasar) throw new TasacionSoloTasadorError();
    // Rechazar una permuta es una decisión de la casa, no del vendedor que la trae.
    if (datos.estado === 'rechazada' && !actorEsAdmin()) {
        throw new ForbiddenException('Rechazar una permuta es una decisión de la concesionaria, no del vendedor.');
    }

    const estado = datos.estado ?? (datos.valorEstimado !== undefined ? 'tasada' : 'sin_tasar');

    const existente = await prisma.tasacion.findFirst({
        where: { atencionId: atencion.id, deletedAt: null },
        orderBy: { id: 'desc' },
    });

    const base = {
        marca: datos.marca,
        modelo: datos.modelo,
        anio: datos.anio ?? null,
        km: datos.km ?? null,
        dominio: datos.dominio ?? null,
        condicion: datos.condicion ?? 'bueno',
        valorEstimado: datos.valorEstimado ?? null,
        moneda: datos.moneda ?? atencion.moneda ?? 'ARS',
        estado,
        observaciones: datos.observaciones ?? null,
    };

    const tasacion = existente
        ? await prisma.tasacion.update({
            where: { id: existente.id },
            data: {
                ...base,
                // El valor no se borra por un PATCH que no lo trae: si ya se tasó,
                // omitirlo significa "no lo toques", no "volvé a cero".
                valorEstimado: datos.valorEstimado ?? existente.valorEstimado,
                estado: datos.estado ?? (datos.valorEstimado !== undefined || existente.valorEstimado !== null ? (existente.estado === 'rechazada' ? 'rechazada' : 'tasada') : 'sin_tasar'),
                // El tasador se estampa de quien puso el valor, nunca del body.
                tasadorId: datos.valorEstimado !== undefined ? actorUserId() : existente.tasadorId,
            },
        })
        : await prisma.tasacion.create({
            data: {
                ...base,
                concesionariaId: tenantId,
                clienteId: atencion.clienteId,
                atencionId: atencion.id,
                tasadorId: datos.valorEstimado !== undefined ? actorUserId() : null,
                fecha: aFechaDia(new Date()),
            } as never,
        });

    await marcarInteraccion(atencion.clienteId);
    await audit({
        entidad: 'Tasacion',
        accion: existente ? 'update' : 'create',
        entidadId: tasacion.id,
        detalle: `Permuta ${estado} en la atención #${atencion.id} (${datos.marca} ${datos.modelo})`,
    });

    return tasacion;
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 6 — CIERRE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cierra la atención. NINGUNA queda abierta sin resultado, y ningún resultado no
 * definitivo se cierra sin próximo contacto (criterio de aceptación 6).
 *
 * ORDEN DE ESCRITURA, y por qué no hay transacción: primero se crea el
 * seguimiento y después se cierra la atención. Si algo falla en el medio queda un
 * seguimiento agendado sin cierre — o sea, el cliente igual va a recibir el
 * llamado, que es lo que le importa al negocio. Al revés (cerrar y después
 * agendar) el modo de falla sería una atención cerrada sin próximo contacto:
 * exactamente lo que el criterio 6 prohíbe.
 */
export async function cerrarAtencion(
    atencionId: number,
    datos: {
        resultado?: 'reserva' | 'cotizacion' | 'test_drive' | 'permuta_a_tasar' | 'en_analisis' | 'sin_unidad' | 'se_retiro';
        observaciones?: string;
        proximoContacto?: string;
        medioProximoContacto?: 'llamada' | 'whatsapp' | 'email' | 'visita' | 'otro';
        notaProximoContacto?: string;
    },
) {
    const atencion = await cargarAtencionAbierta(atencionId);
    const tenantId = tenantObligatorio();

    if (!datos.resultado) throw new ResultadoRequeridoError();
    const definitivo = (RESULTADOS_DEFINITIVOS as readonly string[]).includes(datos.resultado);

    let seguimientoId: number | null = null;
    if (!definitivo) {
        if (!datos.proximoContacto || !datos.medioProximoContacto) {
            throw new ProximoContactoRequeridoError(datos.resultado);
        }
        const proximo = aFechaDia(datos.proximoContacto);
        if (Number.isNaN(proximo.getTime())) {
            throw new ValidationException(
                [{ campo: 'proximoContacto', mensaje: 'Fecha inválida' }],
                'La fecha del próximo contacto es inválida',
            );
        }
        /*
         * Y NO PUEDE SER PASADA. El sentido de exigir próximo contacto es que el
         * lead vuelva a aparecer; un seguimiento fechado en 2020 nace vencido y
         * queda fuera del límite inferior de la ventana más ancha de la agenda
         * (`/reportes/proximos-seguimientos` mira [hoy−90, hoy+90)), o sea que no
         * cae ni como próximo ni como vencido: el criterio 6 quedaba cumplido en la
         * letra y vacío de contenido. La regla vivía SÓLO en la pantalla, y el
         * criterio 7 fija el estándar del módulo: "por ninguna vía, INCLUIDA LA
         * API". Va en el service (no en el schema) porque es una regla de negocio,
         * igual que la exigencia del resultado.
         */
        if (proximo.getTime() < aFechaDia(new Date()).getTime()) {
            throw new ValidationException(
                [{ campo: 'proximoContacto', mensaje: 'La fecha del próximo contacto no puede ser anterior a hoy' }],
                'La fecha del próximo contacto no puede ser anterior a hoy: un seguimiento vencido no vuelve a aparecer en ninguna agenda.',
            );
        }
        const seguimiento = await prisma.clienteSeguimiento.create({
            data: {
                concesionariaId: tenantId,
                clienteId: atencion.clienteId,
                usuarioId: actorUserId(),
                tipo: datos.medioProximoContacto,
                fecha: aFechaDia(new Date()),
                nota:
                    datos.notaProximoContacto?.trim() ||
                    `Cierre de la atención #${atencion.id} con resultado "${datos.resultado}": queda pendiente el próximo contacto.`,
                proximoContacto: proximo,
                atencionId: atencion.id,
            } as never,
        });
        seguimientoId = seguimiento.id;
    }

    // Los resultados que YA son entidades se enlazan, no se duplican: se busca la
    // que se creó durante esta visita y se deja escrita en el cierre. (La reserva
    // la crea `CreateReserva` con su lock y su movimiento de stock; la cotización,
    // el flujo de presupuestos. Este módulo no los reimplementa.)
    const enlaces: { reservaId?: number; presupuestoId?: number } = {};
    if (datos.resultado === 'reserva') {
        const reserva = await prisma.reserva.findFirst({
            where: { clienteId: atencion.clienteId, createdAt: { gte: atencion.iniciadaEn } },
            orderBy: { id: 'desc' },
            select: { id: true },
        });
        if (reserva) enlaces.reservaId = reserva.id;
    }
    if (datos.resultado === 'cotizacion') {
        const presupuesto = await prisma.presupuesto.findFirst({
            where: { clienteId: atencion.clienteId, createdAt: { gte: atencion.iniciadaEn } },
            orderBy: { id: 'desc' },
            select: { id: true },
        });
        if (presupuesto) enlaces.presupuestoId = presupuesto.id;
    }

    const lineas = [
        atencion.observaciones,
        datos.observaciones?.trim() || null,
        enlaces.reservaId ? `Reserva enlazada: #${enlaces.reservaId}.` : null,
        enlaces.presupuestoId ? `Presupuesto enlazado: #${enlaces.presupuestoId}.` : null,
        seguimientoId ? `Próximo contacto agendado (seguimiento #${seguimientoId}).` : null,
    ].filter(Boolean);

    const cerrada = await prisma.atencion.update({
        where: { id: atencion.id },
        data: {
            estado: 'cerrada',
            resultado: datos.resultado,
            cerradaEn: new Date(),
            cerradaAutomaticamente: false,
            observaciones: lineas.length ? lineas.join('\n') : null,
        },
    });

    await marcarInteraccion(atencion.clienteId);
    await audit({
        entidad: 'Atencion',
        accion: 'update',
        entidadId: atencion.id,
        detalle: `Atención #${atencion.id} cerrada con resultado "${datos.resultado}"${seguimientoId ? ` y próximo contacto agendado (#${seguimientoId})` : ''}`,
    });

    return { atencion: cerrada, seguimientoId, enlaces, requeriaProximoContacto: !definitivo };
}

// ─────────────────────────────────────────────────────────────────────────────
// LECTURA
// ─────────────────────────────────────────────────────────────────────────────

export async function listarAtenciones(filtros: {
    estado?: 'abierta' | 'cerrada';
    clienteId?: number;
    vendedorId?: number;
    desde?: string;
    hasta?: string;
    page?: number;
    limit?: number;
}) {
    tenantObligatorio();
    const limit = Math.min(Math.max(Number(filtros.limit) || 20, 1), 100);
    const page = Math.max(Number(filtros.page) || 1, 1);

    const where: Prisma.AtencionWhereInput = { ...(filtroVendedor() ?? {}) };
    if (filtros.estado) where.estado = filtros.estado;
    if (filtros.clienteId) where.clienteId = Number(filtros.clienteId);
    // Un vendedor puro no puede pedir "las de Fulano": el recorte de arriba ya lo
    // acota, y este filtro sólo afina dentro de lo que ya puede ver.
    if (filtros.vendedorId) where.vendedorId = Number(filtros.vendedorId);
    if (filtros.desde || filtros.hasta) {
        where.iniciadaEn = {
            ...(filtros.desde ? { gte: new Date(filtros.desde) } : {}),
            ...(filtros.hasta ? { lte: new Date(filtros.hasta) } : {}),
        };
    }

    const [results, total] = await Promise.all([
        prisma.atencion.findMany({
            where,
            orderBy: { iniciadaEn: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                cliente: { select: { id: true, nombre: true, apellido: true, telefono: true, vendedorAsignadoId: true } },
                vendedor: { select: { id: true, nombre: true } },
                _count: { select: { vehiculos: true } },
            },
        }),
        prisma.atencion.count({ where }),
    ]);

    return { results, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/** Detalle de la atención con todo lo que colgó de la visita. */
export async function obtenerAtencion(id: number) {
    const atencion = await cargarAtencion(id);
    const [vehiculos, tasaciones, seguimientos] = await Promise.all([
        prisma.atencionVehiculo.findMany({
            where: { atencionId: atencion.id },
            orderBy: { id: 'asc' },
            include: { vehiculo: { select: UNIDAD_SELECT } },
        }),
        // `deletedAt: null` explícito: la extensión filtra el modelo raíz de la
        // consulta, no las relaciones de un include (ver prisma.extension.ts).
        prisma.tasacion.findMany({ where: { atencionId: atencion.id, deletedAt: null }, orderBy: { id: 'desc' } }),
        prisma.clienteSeguimiento.findMany({ where: { atencionId: atencion.id, deletedAt: null }, orderBy: { id: 'desc' } }),
    ]);
    return { ...atencion, cliente: sanitizarCliente(atencion.cliente), vehiculos, tasaciones, seguimientos };
}

/** El historial del cliente, para la pantalla de la ficha. */
export async function historialDeCliente(clienteId: number) {
    tenantObligatorio();
    const cliente = await prisma.cliente.findFirst({
        where: { id: clienteId },
        include: { vendedorAsignado: { select: { id: true, nombre: true } } },
    });
    if (!cliente) throw new NotFoundException('Cliente');
    const completo = await puedeVerHistorialCompleto(cliente);
    return { cliente: sanitizarCliente(cliente), historial: await construirHistorial(clienteId, completo) };
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERTA DE ATENCIONES SIN CERRAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Al vendedor le tiene que saltar una ALERTA con cuántas dejó abiertas sin
 * cerrar."
 *
 * Dos números distintos, y por eso están los dos:
 *  - `abiertas`: las que TODAVÍA puede cerrar bien, con el detalle para ir a
 *    hacerlo. Esto es lo que la campanita no da.
 *  - `cerradasPorSistema`: las que ya se le cerraron solas y no puede arreglar.
 *    El conteo NO se recalcula acá: lo resuelve `cierreDiarioWorker`, que es el
 *    mismo que alimenta `/reportes/alertas-resumen` y la campanita del TopBar.
 *    Con dos cuentas propias, la pantalla y la campanita mostrarían números
 *    distintos del mismo hecho.
 *
 * EL CIERRE AUTOMÁTICO NO VIVE ACÁ: lo hace el worker
 * (`infrastructure/atencion/cierreDiarioWorker`, que arranca en server.ts) a la
 * hora de corte configurada por env. No se expone un disparador HTTP a propósito:
 * el barrido es cross-tenant y un endpoint le daría al admin de una concesionaria
 * la posibilidad de cerrar atenciones de otra.
 */
export async function alertaAtenciones() {
    tenantObligatorio();
    const recorte = filtroVendedor() ?? {};
    // La alerta es sobre lo que dejó ESTE vendedor (no sobre la cartera que
    // administra): por eso `vendedorId`, igual que el conteo del worker.
    const vendedorId = actorEsVendedorPuro() ? actorUserId() : null;

    const [abiertas, cerradasPorSistema] = await Promise.all([
        prisma.atencion.findMany({
            where: { estado: 'abierta', ...recorte },
            orderBy: { iniciadaEn: 'asc' },
            take: 100,
            select: {
                id: true,
                iniciadaEn: true,
                motivo: true,
                cliente: { select: { id: true, nombre: true, apellido: true, telefono: true } },
                vendedor: { select: { id: true, nombre: true } },
            },
        }),
        contarAtencionesCerradasPorSistema(vendedorId),
    ]);

    const desdeElCorte = corteVigenteDeLaJornada();
    const propio = vendedorId !== null;
    return {
        abiertas: abiertas.length,
        // ALCANCE del conteo. Para el admin, `filtroVendedor()` es null y esto
        // cuenta las atenciones de TODO el tenant (es una señal de proceso, y así
        // se quiere). Lo que no puede hacer la pantalla es hablarle en segunda
        // persona de trabajo que no es suyo: sin este campo, el admin leía "el
        // sistema cerró 30 atenciones que dejaste abiertas" sin haber abierto
        // ninguna. El número es correcto; la persona gramatical la elige el front
        // con esto.
        alcance: propio ? 'vendedor' : 'tenant',
        // Las de jornadas anteriores son las que el worker va a cerrar solo en el
        // próximo corte: son las urgentes.
        deJornadasAnteriores: abiertas.filter((a) => a.iniciadaEn < desdeElCorte).length,
        cerradasPorSistema,
        ventanaDesde: ventanaDeAlerta(),
        detalle: abiertas,
        mensaje: abiertas.length
            // "atención" pierde la tilde en plural ("atenciones"): pegarle "es" al
            // singular daba "2 atenciónes" en la campanita del vendedor.
            ? `${propio ? 'Tenés' : 'Hay'} ${abiertas.length} ${abiertas.length === 1 ? 'atención' : 'atenciones'} sin cerrar. Ninguna puede quedar sin resultado.`
            : null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// REASIGNACIÓN (la autoriza un supervisor, NUNCA el vendedor)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reasigna el cliente de una atención a otro vendedor.
 *
 * El gate de rol está en la ruta (`authorize('admin')`) Y ACÁ. La duplicación es a
 * propósito: "la reasignación la autoriza un supervisor, NUNCA el vendedor" es una
 * regla del negocio, no una decisión de ruteo, y tiene que seguir valiendo el día
 * que a esta función la llame un job, un import o una pantalla nueva.
 */
export async function reasignarClienteDeAtencion(atencionId: number, datos: { vendedorId: number; motivo?: string }) {
    if (!actorEsAdmin()) {
        throw new ForbiddenException('La reasignación de un cliente la autoriza un supervisor (admin), no el vendedor.');
    }
    const tenantId = tenantObligatorio();
    const atencion = await cargarAtencion(atencionId);

    const destino = await assertMismoTenant('usuario', datos.vendedorId, tenantId);
    if (!destino?.activo) {
        throw new ValidationException(
            [{ campo: 'vendedorId', mensaje: 'El usuario está inactivo' }],
            'No se puede asignar la cartera a un usuario inactivo',
        );
    }

    const anterior = atencion.cliente.vendedorAsignadoId;
    const cliente = await prisma.cliente.update({
        where: { id: atencion.clienteId },
        data: { vendedorAsignadoId: datos.vendedorId, vendedorAsignadoEn: new Date() },
    });

    await audit({
        entidad: 'Cliente',
        accion: 'update',
        entidadId: cliente.id,
        detalle: `Reasignación del cliente ${cliente.id}: ${anterior ?? 'sin vendedor'} → ${datos.vendedorId} (atención #${atencionId})${datos.motivo ? `. Motivo: ${datos.motivo}` : ''}`,
    });

    return cliente;
}
