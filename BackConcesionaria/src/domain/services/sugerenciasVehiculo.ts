/**
 * MOTOR DE SUGERENCIAS DE UNIDADES — dominio PURO.
 *
 * Es el corazón del módulo del vendedor: el vendedor busca algo (una patente,
 * un modelo, un rango de precio) y el sistema le devuelve el resultado MÁS
 * hasta 3 alternativas, cada una con el MOTIVO por el que la sugiere escrito en
 * castellano. Ese texto no es decorativo: el vendedor lo lee EN VOZ ALTA
 * delante del cliente. Por eso "mismo modelo, 2 años más nuevo, +8% de precio"
 * y nunca "similar".
 *
 * POR QUÉ ES PURO (sin prisma, sin env, sin fetch):
 *  1. Las reglas de cercanía son las que más van a cambiar cuando el dueño mire
 *     los resultados reales. Tienen que poder cambiarse sin tocar un repositorio.
 *  2. Los unit tests del CI corren con un DATABASE_URL dummy: cualquier import
 *     que arrastre prisma mata el proceso en el import (env valida y hace
 *     process.exit). Este módulo no importa NADA.
 *  3. Una sugerencia mala le hace perder credibilidad al vendedor delante del
 *     cliente. Las reglas que evitan eso (no repetir, no ofrecer algo peor en
 *     todo, no rellenar para llegar a 3) merecen tests exhaustivos y baratos.
 *
 * QUÉ ENTRA: el stock de la concesionaria ya acotado por el caller (tenant,
 * sucursal, lo que sea que convenga filtrar en SQL por performance) y los
 * parámetros de búsqueda. QUÉ SALE: el resultado + 0..3 alternativas con motivo.
 *
 * OJO — el filtro duro de disponibilidad se aplica ACÁ ADENTRO, no se delega al
 * caller. El criterio de aceptación 4 ("ninguna alternativa sugerida corresponde
 * a una unidad no disponible") no puede depender de que cada llamador se acuerde
 * de poner el `where`. El stock puede venir con unidades no disponibles: este
 * módulo las usa para poder INFORMAR el estado de la buscada, y jamás las sugiere.
 */

// ---------------------------------------------------------------------------
// TIPOS
// ---------------------------------------------------------------------------

export type ModoBusqueda = 'presupuesto' | 'modelo' | 'unidad';

/**
 * Una unidad tal como la ve el VENDEDOR. A propósito no lleva precioCompra, ni
 * gastos de preparación, ni margen, ni proveedor: el motor no puede filtrar ni
 * ordenar por un dato que el vendedor no tiene derecho a ver, así que ni siquiera
 * entra al módulo (criterio de aceptación 7). `precio` es el precio de LISTA.
 *
 * Los campos son un espejo de la proyección VEHICULO_PUBLICO más tres calculados
 * (`diasEnStock`, `segmento`, `prioridadVenta`) que el caller deriva.
 */
export interface UnidadCandidata {
    id: number;
    marca: string;
    modelo: string;
    version?: string | null;
    anio?: number | null;
    km?: number | null;
    /** Precio de LISTA. Sin precio no se puede ofrecer: ver FILTROS DUROS. */
    precio?: number | null;
    moneda: string;
    /** EstadoVehiculo como texto. El módulo no importa @prisma/client para seguir puro. */
    estado: string;
    diasEnStock?: number | null;
    /**
     * Segmento comercial (SUV compacta, sedán mediano...). HOY NO EXISTE en el
     * schema: queda opcional a propósito. Cuando falta, la banda de precio ±15%
     * hace sola el trabajo de "mismo segmento" — que es, al fin y al cabo, la
     * aproximación que usa cualquier vendedor.
     */
    segmento?: string | null;
    /**
     * Marcada por administración como unidad a mover (rotación / prioridad de
     * venta). HOY NO EXISTE en el schema —igual que `segmento`—: queda opcional a
     * propósito y cuando falta, el piso de `DIAS_STOCK_PARA_ROTACION` hace solo el
     * trabajo de "ésta hay que moverla". El día que exista la columna, el caller la
     * deriva y el criterio 3 la prioriza sin tocar este módulo.
     */
    prioridadVenta?: boolean;
    /**
     * Sólo para estados de tránsito: si el ingreso tiene fecha confirmada.
     * El encargo excluye "en tránsito SIN fecha de ingreso confirmada", o sea que
     * con fecha confirmada sí se puede ofrecer.
     */
    fechaIngresoConfirmada?: boolean;
    dominio?: string | null;
    vin?: string | null;
    numeroStock?: string | null;
}

/** Una unidad que ya se le mostró a este cliente en una atención anterior. */
export interface UnidadYaMostrada {
    vehiculoId: number;
    /**
     * Precio de lista al momento de mostrársela. Es lo que permite aplicar la
     * excepción "salvo que haya bajado de precio". Si no se guardó, no se puede
     * probar la baja y la unidad no se repite.
     */
    precioAlMostrar?: number | null;
}

export interface ParamsBusqueda {
    modo: ModoBusqueda;
    /**
     * Modo 'unidad': la unidad que el vendedor resolvió por patente, N° de stock
     * o VIN, CON SU ESTADO REAL. Se pasa aparte del stock porque resolverla es
     * otra consulta, y porque puede estar vendida o reservada — justamente el
     * caso en que hay que informar su estado y las alternativas pasan a ser la
     * respuesta principal.
     */
    unidadBuscada?: UnidadCandidata;
    /** Modo 'modelo'. `marca` y `modelo` mandan; version/anio afinan la exacta. */
    marca?: string;
    modelo?: string;
    version?: string;
    anio?: number;
    /**
     * El rango relevado. OJO: cuando hay permuta o anticipo el caller manda acá
     * el PRESUPUESTO REAL (ver calcularPresupuestoReal), no lo que el cliente
     * dijo al principio.
     *
     * FILTRA sólo en modo 'presupuesto'. En 'unidad' y 'modelo' el techo NO
     * descarta nada: alimenta el upsell (criterio 3 del modo modelo) y MARCA las
     * unidades que lo superan. Si filtrara ahí, preguntar por una unidad más cara
     * que el techo declarado —que es lo que pasa todo el tiempo— dejaba la
     * búsqueda sin alternativas y sin decir por qué.
     */
    presupuestoMin?: number;
    presupuestoMax?: number;
    /**
     * Moneda en la que se compara. Comparar un usado de USD 18.500 contra uno de
     * ARS 25.000.000 por el número pelado da cualquier cosa, así que las unidades
     * en otra moneda se descartan.
     *
     * PESO DISTINTO SEGÚN EL MODO, y el motivo:
     *  - `presupuesto`: es un FILTRO DURO y se aplica también a la exacta. El
     *    rango que tipeó el vendedor está expresado en esta moneda; devolver como
     *    "lo que buscaba" un auto en otra unidad de cuenta es mostrarle al cliente
     *    un número que no es el que pidió.
     *  - `unidad` y `modelo`: es sólo una PREFERENCIA. Ahí el vendedor no eligió
     *    una moneda, resolvió una patente o tipeó un modelo, y la moneda de
     *    comparación la fija la unidad encontrada. Forzar la de la atención
     *    (que nace en ARS por default) barría todo el stock de una concesionaria
     *    que publica los usados en dólares y devolvía cero alternativas con un
     *    aviso falso. Si no viene, se infiere igual.
     */
    moneda?: string;
    /**
     * Moneda en la que están expresados `presupuestoMin`/`presupuestoMax`.
     *
     * El techo relevado en una visita queda pegado a la atención; si después la
     * búsqueda termina comparando en OTRA moneda (la de la unidad que el cliente
     * vino a ver), ese número no significa nada. Cuando no coincide con la moneda
     * de comparación el rango se IGNORA: convertirlo exigiría una cotización del
     * día y un supuesto que el vendedor no puede auditar delante del cliente.
     * Si no viene se asume que el rango está en la moneda de comparación.
     */
    monedaPresupuesto?: string;
    /** El vendedor pidió explícitamente volver a ver lo ya mostrado. */
    incluirYaMostradas?: boolean;
}

export interface Sugerencia {
    unidad: UnidadCandidata;
    /** Legible y concreto. Es lo que el vendedor le dice al cliente. */
    motivo: string;
    /** true = supera el máximo del cliente (hasta +10%). Se muestra, no se esconde. */
    porEncimaDelMaximo?: boolean;
}

export interface ResultadoBusqueda {
    /** La unidad que se buscó, sólo si está DISPONIBLE. */
    exacta?: UnidadCandidata;
    /** Si la buscada NO está disponible: su estado en castellano, para decirlo con claridad. */
    estadoDeLaExacta?: string;
    /**
     * La exacta supera el máximo relevado. Pasa en los modos `unidad` y `modelo`:
     * el cliente pregunta por algo más caro de lo que dijo al entrar. No se
     * esconde ni se descarta — se muestra MARCADA, igual que las alternativas.
     */
    exactaPorEncimaDelMaximo?: boolean;
    /** 0..3. Nunca más de 3, nunca relleno. */
    alternativas: Sugerencia[];
    /**
     * Moneda en la que se comparó de verdad. El caller la necesita para poder
     * decir con qué se filtró (y para persistirla): en los modos `unidad` y
     * `modelo` la fija la unidad encontrada, no lo que venía en `params`.
     */
    moneda: string;
    /** Presente sólo cuando hay menos de 3 alternativas: hay que informarlo, no disimularlo. */
    aviso?: string;
}

// ---------------------------------------------------------------------------
// CONSTANTES DE NEGOCIO
// ---------------------------------------------------------------------------

/** Regla general del encargo: toda búsqueda devuelve SIEMPRE hasta 3 alternativas. */
export const MAX_ALTERNATIVAS = 3;

/** Umbral por encima del máximo del cliente. Confirmado por el dueño del producto. */
export const UMBRAL_SOBRE_MAXIMO = 0.10;

/** Banda de "mismo segmento y rango de precio" y de "precio similar". */
export const BANDA_PRECIO_SIMILAR = 0.15;

/**
 * Hasta dónde llega un "modelo equivalente" / "un escalón arriba", en precio.
 *
 * POR QUÉ EXISTE: sin este tope, "misma marca, modelo equivalente" le ofrecía un
 * Etios 38% más barato a alguien que vino por un Corolla, y "un escalón arriba
 * dentro del presupuesto" le ofrecía una Hilux al 104% sólo porque el techo que
 * declaró el cliente lo permitía. Ninguna de las dos es equivalente ni es un
 * escalón: son otra categoría de auto, y ofrecerlas es perder credibilidad
 * delante del cliente. Un escalón es un escalón, no un salto.
 */
export const BANDA_MODELO_EQUIVALENTE = 0.35;

/**
 * Cuántos km "valen" un año al comparar relación año/km. Un usado argentino gira
 * entre 15.000 y 20.000 km por año: con 20.000 un 2021 con 60.000 km empata con
 * un 2018 con 0 km, que es más o menos como lo pondera un vendedor.
 */
export const KM_POR_ANIO_EQUIVALENTE = 20000;

/**
 * Piso de días en stock para que el criterio 3 del modo presupuesto ("mayor
 * rotación o prioridad de venta") signifique ROTACIÓN.
 *
 * POR QUÉ EXISTE: sin piso, la guarda era `esNumero(u.diasEnStock)`, y como toda
 * unidad tiene fecha de ingreso eso es verdadero para TODO el stock. El criterio
 * dejaba de ser un ángulo distinto y su motivo llegaba a decir "lleva 0 días en
 * stock" como razón para ofrecer la unidad — el argumento exactamente inverso al
 * que el criterio quiere dar ("ésta la tenemos hace mucho, la movemos").
 *
 * El número es el mismo umbral con el que el reporte de stock estancado
 * (`ReporteController`) considera parada una unidad: dos pantallas del mismo
 * producto no pueden tener dos definiciones de "lleva mucho".
 */
export const DIAS_STOCK_PARA_ROTACION = 60;

/**
 * Estados en los que una unidad se puede ofrecer. Lista BLANCA a propósito
 * (default-deny): si mañana aparece un estado nuevo en el enum, no se filtra solo
 * por olvido. Hoy sólo `publicado`; `preparacion`, `reservado`, `vendido` y
 * `devuelto` quedan afuera — `devuelto` porque una unidad que volvió necesita
 * revisión antes de volver a ofrecerse.
 */
export const ESTADOS_DISPONIBLES: readonly string[] = ['publicado'];

/**
 * Estados de tránsito: se pueden ofrecer SÓLO con fecha de ingreso confirmada.
 * Todavía no existen en EstadoVehiculo; están acá porque el encargo los nombra
 * explícitamente y así el día que se agreguen la regla ya está escrita y testeada.
 */
export const ESTADOS_TRANSITO: readonly string[] = ['transito', 'en_transito'];

/** Estado de la unidad → cómo se lo decís al cliente. */
const ESTADO_LEGIBLE: Record<string, string> = {
    vendido: 'ya está vendida',
    reservado: 'está reservada / señada',
    preparacion: 'está en preparación (taller)',
    devuelto: 'está devuelta, pendiente de revisión',
    transito: 'está en tránsito, sin fecha de ingreso confirmada',
    en_transito: 'está en tránsito, sin fecha de ingreso confirmada',
};

// ---------------------------------------------------------------------------
// HELPERS PUROS DE FORMATO
// ---------------------------------------------------------------------------

/**
 * Separador de miles a mano en vez de Intl.NumberFormat: Intl mete espacios
 * duros (U+00A0) que hacen frágiles las aserciones de los tests y depende del
 * ICU con el que se haya compilado Node. Acá el texto es siempre el mismo.
 */
const miles = (n: number): string =>
    Math.round(Math.abs(n))
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** "$2.450.000" para pesos, "USD 18.500" para el resto. */
export const formatearPrecio = (n: number, moneda: string): string =>
    moneda === 'ARS' ? `$${miles(n)}` : `${moneda} ${miles(n)}`;

/** Variación porcentual redondeada de `base` a `valor`. 0 si la base es 0. */
const variacionPorcentual = (base: number, valor: number): number =>
    base === 0 ? 0 : Math.round(((valor - base) / base) * 100);

/** Compara marcas/modelos sin que un acento o una mayúscula rompan el match. */
export const normalizarTexto = (s: string | null | undefined): string =>
    (s ?? '')
        .normalize('NFD')
        .split('')
        // Fuera las marcas diacriticas que dejo suelta la descomposicion NFD.
        .filter((c) => c.charCodeAt(0) < 0x0300 || c.charCodeAt(0) > 0x036f)
        .join('')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

const esNumero = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

// ---------------------------------------------------------------------------
// REGLAS DE DISPONIBILIDAD
// ---------------------------------------------------------------------------

/** FILTRO DURO. Sólo unidades que el vendedor puede ofrecer de verdad. */
export function estaDisponible(u: UnidadCandidata): boolean {
    if (ESTADOS_DISPONIBLES.includes(u.estado)) return true;
    // En tránsito: sólo si el ingreso ya tiene fecha confirmada.
    if (ESTADOS_TRANSITO.includes(u.estado)) return u.fechaIngresoConfirmada === true;
    return false;
}

/** El estado de una unidad no disponible, dicho con claridad. */
export function describirEstado(u: UnidadCandidata): string {
    if (ESTADOS_TRANSITO.includes(u.estado)) {
        return u.fechaIngresoConfirmada === true
            ? 'está en tránsito, con fecha de ingreso confirmada'
            : 'está en tránsito, sin fecha de ingreso confirmada';
    }
    return ESTADO_LEGIBLE[u.estado] ?? `no está disponible (estado: ${u.estado})`;
}

/**
 * "Peor en TODOS los ejes": más cara Y más vieja Y con más km que la buscada.
 * Ofrecer eso es quedar mal, así que no se sugiere.
 *
 * Se exige que los tres ejes sean comparables. Si a alguna de las dos le falta el
 * año o el km, no se puede AFIRMAR que sea peor en todo, y se prefiere mostrarla
 * a descartarla en silencio por un dato de carga incompleto.
 */
export function esPeorEnTodosLosEjes(ref: UnidadCandidata, cand: UnidadCandidata): boolean {
    if (!esNumero(ref.precio) || !esNumero(cand.precio)) return false;
    if (!esNumero(ref.anio) || !esNumero(cand.anio)) return false;
    if (!esNumero(ref.km) || !esNumero(cand.km)) return false;
    return cand.precio > ref.precio && cand.anio < ref.anio && cand.km > ref.km;
}

/**
 * PRESUPUESTO REAL: lo que el cliente puede poner de verdad es el valor de toma
 * de la permuta más el anticipo, no el número que tiró al entrar. Este número
 * manda el filtro (paso 3 del flujo).
 */
export function calcularPresupuestoReal(input: {
    valorPermuta?: number | null;
    anticipo?: number | null;
}): number {
    const permuta = esNumero(input.valorPermuta) ? input.valorPermuta : 0;
    const anticipo = esNumero(input.anticipo) ? input.anticipo : 0;
    return Math.max(0, permuta + anticipo);
}

// ---------------------------------------------------------------------------
// PUNTAJES Y FRAGMENTOS DE MOTIVO
// ---------------------------------------------------------------------------

/** Calidad año/km: más alto = más nuevo y/o menos usado. Ver KM_POR_ANIO_EQUIVALENTE. */
function puntajeAnioKm(u: UnidadCandidata): number {
    const anio = esNumero(u.anio) ? u.anio : 0;
    const km = esNumero(u.km) ? u.km : 0;
    return anio - km / KM_POR_ANIO_EQUIVALENTE;
}

/** Distancia a la referencia: menor = más parecida. Ordena dentro de cada criterio. */
function distanciaA(ref: UnidadCandidata, cand: UnidadCandidata): number {
    let d = 0;
    if (esNumero(ref.precio) && esNumero(cand.precio)) {
        d += Math.abs(variacionPorcentual(ref.precio, cand.precio));
    }
    if (esNumero(ref.anio) && esNumero(cand.anio)) d += Math.abs(ref.anio - cand.anio) * 3;
    if (esNumero(ref.km) && esNumero(cand.km)) {
        d += (Math.abs(ref.km - cand.km) / KM_POR_ANIO_EQUIVALENTE) * 2;
    }
    return d;
}

/** "2 años más nuevo", "38.000 km menos", "+8% de precio". El detalle que se dice en voz alta. */
function fragmentosComparativos(ref: UnidadCandidata, cand: UnidadCandidata): string[] {
    const out: string[] = [];

    if (esNumero(ref.anio) && esNumero(cand.anio)) {
        const d = cand.anio - ref.anio;
        if (d > 0) out.push(`${d} año${d === 1 ? '' : 's'} más nuevo`);
        else if (d < 0) out.push(`${-d} año${d === -1 ? '' : 's'} más viejo`);
        else out.push('mismo año');
    }

    if (esNumero(ref.km) && esNumero(cand.km)) {
        const d = cand.km - ref.km;
        if (d !== 0) out.push(`${miles(d)} km ${d < 0 ? 'menos' : 'más'}`);
    }

    if (esNumero(ref.precio) && esNumero(cand.precio)) {
        const p = variacionPorcentual(ref.precio, cand.precio);
        out.push(p === 0 ? 'mismo precio' : `${p > 0 ? '+' : ''}${p}% de precio`);
    }

    return out;
}

/** "Toyota Corolla XEI 2021". Para nombrar la unidad dentro del motivo. */
function nombrar(u: UnidadCandidata): string {
    return [u.marca, u.modelo, u.version ?? undefined, esNumero(u.anio) ? String(u.anio) : undefined]
        .filter(Boolean)
        .join(' ');
}

// ---------------------------------------------------------------------------
// CLASIFICACIÓN INTERNA
// ---------------------------------------------------------------------------

/**
 * Un candidato ya clasificado. `criterio` es 1, 2 o 3 y corresponde a los TRES
 * criterios de cercanía del encargo, que son DISTINTOS según el modo de búsqueda
 * — por eso se clasifican en funciones separadas y no en una sola genérica.
 */
interface Clasificado {
    unidad: UnidadCandidata;
    criterio: 1 | 2 | 3;
    distancia: number;
    motivo: string;
    porEncimaDelMaximo?: boolean;
}

/** Dentro de un criterio: primero la más cercana; empate, por id (determinismo para los tests). */
function ordenarPorDistancia(a: Clasificado, b: Clasificado): number {
    return a.distancia - b.distancia || a.unidad.id - b.unidad.id;
}

/**
 * Reparto ROUND-ROBIN entre los tres criterios: primero la mejor de cada uno,
 * después se rellenan los lugares que sobren respetando el orden de criterio.
 *
 * POR QUÉ: el encargo enumera tres criterios distintos por modo. Si se ordenara
 * sólo por ranking global, un criterio con muchas unidades (típicamente el 1,
 * "mismo modelo") se comería las tres alternativas y el vendedor nunca vería ni
 * la competencia del segmento ni el upsell. Así las tres alternativas muestran
 * tres ángulos distintos, que es lo que sirve delante del cliente.
 */
function repartirEntreCriterios(clasificados: Clasificado[]): Clasificado[] {
    const porCriterio: Record<1 | 2 | 3, Clasificado[]> = {
        1: clasificados.filter((c) => c.criterio === 1).sort(ordenarPorDistancia),
        2: clasificados.filter((c) => c.criterio === 2).sort(ordenarPorDistancia),
        3: clasificados.filter((c) => c.criterio === 3).sort(ordenarPorDistancia),
    };

    const elegidas: Clasificado[] = [];
    const yaElegida = new Set<number>();

    // Vuelta 1: la mejor de cada criterio.
    for (const c of [1, 2, 3] as const) {
        const mejor = porCriterio[c].find((x) => !yaElegida.has(x.unidad.id));
        if (mejor && elegidas.length < MAX_ALTERNATIVAS) {
            elegidas.push(mejor);
            yaElegida.add(mejor.unidad.id);
        }
    }

    // Vuelta 2: se completan los lugares vacíos, criterio por criterio.
    for (const c of [1, 2, 3] as const) {
        for (const x of porCriterio[c]) {
            if (elegidas.length >= MAX_ALTERNATIVAS) break;
            if (yaElegida.has(x.unidad.id)) continue;
            elegidas.push(x);
            yaElegida.add(x.unidad.id);
        }
    }

    return elegidas;
}

// --- Criterios por modo -----------------------------------------------------

/**
 * MODO UNIDAD (buscó una patente / N° de stock / VIN):
 *  1) mismo modelo, otra unidad (distinto año, km o versión)
 *  2) mismo segmento y rango de precio ±15%
 *  3) misma marca, modelo equivalente
 */
function clasificarPorUnidad(ref: UnidadCandidata, pool: UnidadCandidata[]): Clasificado[] {
    const marcaRef = normalizarTexto(ref.marca);
    const modeloRef = normalizarTexto(ref.modelo);
    const out: Clasificado[] = [];

    for (const u of pool) {
        const mismaMarca = normalizarTexto(u.marca) === marcaRef;
        const mismoModelo = mismaMarca && normalizarTexto(u.modelo) === modeloRef;
        const comp = fragmentosComparativos(ref, u);
        const distancia = distanciaA(ref, u);

        if (mismoModelo) {
            out.push({
                unidad: u,
                criterio: 1,
                distancia,
                motivo: ['mismo modelo, otra unidad', ...comp].join(', '),
            });
            continue;
        }

        // Criterio 2: mismo segmento (si lo hay cargado) dentro de ±15% de precio.
        const enBanda =
            esNumero(ref.precio) &&
            esNumero(u.precio) &&
            Math.abs(variacionPorcentual(ref.precio, u.precio)) <= BANDA_PRECIO_SIMILAR * 100;
        const segmentosCargados = Boolean(ref.segmento && u.segmento);
        const mismoSegmento = segmentosCargados
            ? normalizarTexto(u.segmento) === normalizarTexto(ref.segmento)
            : true; // sin segmento cargado, la banda de precio hace sola de proxy

        if (enBanda && mismoSegmento) {
            const etiqueta = segmentosCargados
                ? `mismo segmento (${ref.segmento})`
                : 'rango de precio similar (±15%)';
            out.push({
                unidad: u,
                criterio: 2,
                distancia,
                motivo: [etiqueta, ...comp].join(', '),
            });
            continue;
        }

        /*
         * Criterio 3: misma marca, modelo EQUIVALENTE. El tope de precio es lo
         * que hace que "equivalente" signifique algo: sin él, a quien vino por un
         * Corolla se le terminaba ofreciendo un Etios 38% más barato.
         */
        const equivalenteEnPrecio =
            !esNumero(ref.precio) ||
            !esNumero(u.precio) ||
            Math.abs(variacionPorcentual(ref.precio, u.precio)) <= BANDA_MODELO_EQUIVALENTE * 100;

        if (mismaMarca && equivalenteEnPrecio) {
            out.push({
                unidad: u,
                criterio: 3,
                distancia,
                motivo: [`misma marca, modelo equivalente: ${u.modelo}`, ...comp].join(', '),
            });
        }
    }

    return out;
}

/**
 * MODO MODELO (buscó marca/modelo/versión/año):
 *  1) otras versiones o años del mismo modelo
 *  2) competencia directa del segmento a precio similar
 *  3) un escalón arriba dentro del presupuesto (upsell), SÓLO si entra
 */
function clasificarPorModelo(
    params: ParamsBusqueda,
    ref: UnidadCandidata | undefined,
    pool: UnidadCandidata[],
): Clasificado[] {
    const marcaRef = normalizarTexto(params.marca ?? ref?.marca);
    const modeloRef = normalizarTexto(params.modelo ?? ref?.modelo);
    const precioRef = esNumero(ref?.precio) ? ref!.precio! : undefined;
    const out: Clasificado[] = [];

    for (const u of pool) {
        const mismoModelo =
            normalizarTexto(u.marca) === marcaRef && normalizarTexto(u.modelo) === modeloRef;
        const comp = ref ? fragmentosComparativos(ref, u) : [];
        const distancia = ref ? distanciaA(ref, u) : 0;

        if (mismoModelo) {
            const detalle = [u.version ?? undefined, esNumero(u.anio) ? String(u.anio) : undefined]
                .filter(Boolean)
                .join(' ');
            out.push({
                unidad: u,
                criterio: 1,
                distancia,
                motivo: [`mismo modelo${detalle ? `, ${detalle}` : ''}`, ...comp].join(', '),
            });
            continue;
        }

        // Criterio 2: competencia directa del segmento a precio similar (otra marca).
        const enBanda =
            precioRef !== undefined &&
            esNumero(u.precio) &&
            Math.abs(variacionPorcentual(precioRef, u.precio)) <= BANDA_PRECIO_SIMILAR * 100;
        const segmentosCargados = Boolean(ref?.segmento && u.segmento);
        const mismoSegmento = segmentosCargados
            ? normalizarTexto(u.segmento) === normalizarTexto(ref!.segmento)
            : true;

        if (enBanda && mismoSegmento) {
            out.push({
                unidad: u,
                criterio: 2,
                distancia,
                motivo: [
                    `competencia directa de ${[params.marca ?? ref?.marca, params.modelo ?? ref?.modelo]
                        .filter(Boolean)
                        .join(' ')}: ${nombrar(u)}`,
                    ...comp,
                ].join(', '),
            });
            continue;
        }

        /*
         * Criterio 3: un escalón ARRIBA — más cara que la referencia — pero
         * SÓLO si entra en el presupuesto. Sin presupuestoMax no hay upsell:
         * no se puede afirmar que "entra" y ofrecer algo que el cliente no puede
         * pagar es exactamente la sugerencia que hace quedar mal al vendedor.
         */
        if (
            precioRef !== undefined &&
            esNumero(params.presupuestoMax) &&
            esNumero(u.precio) &&
            u.precio > precioRef &&
            u.precio <= params.presupuestoMax &&
            // Un ESCALÓN arriba, no un salto de categoría: que el techo declarado
            // dé el número no vuelve equivalente a una Hilux con un Corolla.
            variacionPorcentual(precioRef, u.precio) <= BANDA_MODELO_EQUIVALENTE * 100
        ) {
            const sube = variacionPorcentual(precioRef, u.precio);
            out.push({
                unidad: u,
                criterio: 3,
                distancia,
                motivo: `un escalón arriba y entra en el presupuesto: ${nombrar(u)}, +${sube}% de precio, dentro de tu máximo de ${formatearPrecio(params.presupuestoMax, u.moneda)}`,
            });
        }
    }

    return out;
}

/**
 * MODO PRESUPUESTO (rango min/max):
 *  1) mejor relación año/km dentro del rango
 *  2) unidades apenas por encima del máximo (hasta +10%), MARCADAS COMO TALES
 *  3) unidades con mayor rotación o prioridad de venta
 *
 * Por debajo del mínimo no se ofrece nada: el mínimo es una expectativa de
 * calidad del cliente, no un descuido.
 */
function clasificarPorPresupuesto(params: ParamsBusqueda, pool: UnidadCandidata[]): Clasificado[] {
    const min = esNumero(params.presupuestoMin) ? params.presupuestoMin : undefined;
    const max = esNumero(params.presupuestoMax) ? params.presupuestoMax : undefined;
    const out: Clasificado[] = [];

    for (const u of pool) {
        if (!esNumero(u.precio)) continue;
        if (min !== undefined && u.precio < min) continue;

        const dentroDelRango = max === undefined || u.precio <= max;

        if (dentroDelRango) {
            const detalle = [
                esNumero(u.anio) ? String(u.anio) : undefined,
                esNumero(u.km) ? `${miles(u.km)} km` : undefined,
                formatearPrecio(u.precio, u.moneda),
            ]
                .filter(Boolean)
                .join(', ');

            // Criterio 1: mejor relación año/km. Se ordena por distancia, así que
            // se invierte el puntaje (más calidad = menos distancia).
            out.push({
                unidad: u,
                criterio: 1,
                distancia: -puntajeAnioKm(u),
                motivo: `buena relación año/km dentro de tu presupuesto: ${detalle}`,
            });

            // Criterio 3: rotación / prioridad de venta. La misma unidad puede
            // calificar para el 1 y el 3; el reparto round-robin se queda con una.
            // El piso de días es lo que hace que esto sea ROTACIÓN y no "cualquier
            // unidad del rango": una que entró esta semana no es un argumento de
            // rotación, y decirle al cliente "lleva 0 días en stock" es el
            // argumento inverso.
            const diasParados =
                esNumero(u.diasEnStock) && u.diasEnStock >= DIAS_STOCK_PARA_ROTACION ? u.diasEnStock : null;
            if (u.prioridadVenta === true || diasParados !== null) {
                const partes: string[] = [];
                if (u.prioridadVenta === true) partes.push('prioridad de venta');
                if (diasParados !== null) partes.push(`lleva ${diasParados} día${diasParados === 1 ? '' : 's'} en stock`);
                out.push({
                    unidad: u,
                    criterio: 3,
                    // Más días en stock = más urgente de mover = primero.
                    distancia: -(u.prioridadVenta === true ? 100000 : 0) - (diasParados ?? 0),
                    motivo: `${partes.join(', ')}: ${nombrar(u)}, ${formatearPrecio(u.precio, u.moneda)}`,
                });
            }
            continue;
        }

        // Criterio 2: apenas por encima del máximo, hasta +10%. Se MARCA.
        if (max !== undefined && u.precio <= max * (1 + UMBRAL_SOBRE_MAXIMO)) {
            const exceso = u.precio - max;
            const pct = variacionPorcentual(max, u.precio);
            out.push({
                unidad: u,
                criterio: 2,
                distancia: exceso,
                porEncimaDelMaximo: true,
                motivo: `${nombrar(u)} a ${formatearPrecio(u.precio, u.moneda)}: ${formatearPrecio(exceso, u.moneda)} por encima de tu máximo (+${pct}%)`,
            });
        }
    }

    return out;
}

// ---------------------------------------------------------------------------
// API PÚBLICA
// ---------------------------------------------------------------------------

/**
 * Devuelve el resultado de la búsqueda MÁS hasta 3 alternativas, cada una con su
 * motivo. Si no hay 3 que cumplan, devuelve las que haya y lo INFORMA en `aviso`:
 * nunca completa con relleno.
 *
 * @param params      qué buscó el vendedor y en qué modo
 * @param stock       stock de la concesionaria; puede traer unidades NO disponibles
 *                    (se usan sólo para informar estado, jamás se sugieren)
 * @param yaMostradas unidades ya mostradas a este cliente en atenciones anteriores
 */
export function sugerir(
    params: ParamsBusqueda,
    stock: UnidadCandidata[],
    yaMostradas: UnidadYaMostrada[] = [],
): ResultadoBusqueda {
    // --- 1. La exacta, su estado y LA MONEDA DE COMPARACIÓN -----------------
    // La moneda sale de acá y no de una cadena de `??` posterior: en los modos
    // `unidad` y `modelo` la fija la unidad encontrada, así que resolverla exige
    // haber resuelto antes qué unidad es. Ver `resolverExacta`.
    const { exacta, estadoDeLaExacta, referencia, moneda } = resolverExacta(params, stock);

    // --- 2. ¿El rango relevado aplica a ESTA comparación? -------------------
    // Un techo relevado en pesos no dice nada sobre un stock que se compara en
    // dólares. Si las monedas no coinciden el rango se ignora entero (no se
    // convierte: eso exigiría una cotización del día).
    const presupuestoAplica = !params.monedaPresupuesto || params.monedaPresupuesto === moneda;
    const presupuestoMin = presupuestoAplica && esNumero(params.presupuestoMin) ? params.presupuestoMin : undefined;
    const presupuestoMax = presupuestoAplica && esNumero(params.presupuestoMax) ? params.presupuestoMax : undefined;
    const paramsEfectivos: ParamsBusqueda = { ...params, moneda, presupuestoMin, presupuestoMax };

    // --- 3. FILTROS DUROS ---------------------------------------------------
    const mostradasPorId = new Map(yaMostradas.map((m) => [m.vehiculoId, m]));
    const bajaronDePrecio = new Set<number>();
    // Cuántas unidades OFRECIBLES quedaron afuera sólo por la moneda. Es lo que
    // permite que el aviso diga la verdad cuando el pool queda vacío: "no hay
    // alternativas que cumplan los criterios" es falso si lo que pasó fue que el
    // stock está publicado en otra moneda.
    let descartadasPorMoneda = 0;

    const pool = stock.filter((u) => {
        // Nunca una unidad no disponible (criterio de aceptación 4).
        if (!estaDisponible(u)) return false;
        // Sin precio de lista no se puede ofrecer: el vendedor no puede decir cuánto sale.
        if (!esNumero(u.precio)) return false;
        // La buscada no es alternativa de sí misma.
        if (referencia && u.id === referencia.id) return false;
        if (exacta && u.id === exacta.id) return false;
        // Comparar entre monedas distintas da números sin sentido.
        if (u.moneda !== moneda) {
            descartadasPorMoneda++;
            return false;
        }
        /*
         * TECHO PRESUPUESTARIO DURO: SÓLO en modo presupuesto.
         *
         * En `unidad` y `modelo` el cliente está preguntando por algo concreto que
         * puede costar más que el techo que declaró al entrar (pregunta por una
         * Hilux de $26M habiendo dicho $20M). Aplicar el techo ahí descartaba EN
         * SILENCIO las otras unidades de ese mismo modelo y devolvía cero
         * alternativas con un aviso que le echaba la culpa a los criterios de
         * cercanía. En esos modos el máximo no filtra: alimenta el upsell
         * (criterio 3 del modo modelo) y MARCA lo que lo supera.
         */
        if (
            params.modo === 'presupuesto' &&
            presupuestoMax !== undefined &&
            u.precio > presupuestoMax * (1 + UMBRAL_SOBRE_MAXIMO)
        ) {
            return false;
        }
        // Nada peor en TODOS los ejes que lo que el cliente vino a ver.
        if (referencia && esPeorEnTodosLosEjes(referencia, u)) return false;

        // Ya mostrada en una atención anterior: no se repite, salvo que el vendedor
        // lo pida o que la unidad haya BAJADO de precio (eso sí es noticia nueva).
        const mostrada = mostradasPorId.get(u.id);
        if (mostrada && !params.incluirYaMostradas) {
            if (!esNumero(mostrada.precioAlMostrar)) return false;
            if (u.precio >= mostrada.precioAlMostrar) return false;
            bajaronDePrecio.add(u.id);
        }
        return true;
    });

    // --- 4. Los tres criterios de cercanía, distintos por modo --------------
    let clasificados: Clasificado[];
    if (params.modo === 'unidad') {
        clasificados = referencia ? clasificarPorUnidad(referencia, pool) : [];
    } else if (params.modo === 'modelo') {
        clasificados = clasificarPorModelo(paramsEfectivos, referencia, pool);
    } else {
        clasificados = clasificarPorPresupuesto(paramsEfectivos, pool);
    }

    // --- 5. Hasta 3, repartidas entre los criterios -------------------------
    const alternativas: Sugerencia[] = repartirEntreCriterios(clasificados).map((c) => {
        const mostrada = mostradasPorId.get(c.unidad.id);
        let motivo = c.motivo;
        if (bajaronDePrecio.has(c.unidad.id) && esNumero(mostrada?.precioAlMostrar)) {
            const baja = -variacionPorcentual(mostrada!.precioAlMostrar!, c.unidad.precio as number);
            motivo += ` — ya se la mostraste, bajó un ${baja}% desde entonces`;
        } else if (mostrada && params.incluirYaMostradas) {
            motivo += ' — ya se la mostraste en una visita anterior';
        }
        // "MARCADAS COMO TALES" vale en LOS TRES MODOS. `clasificarPorPresupuesto`
        // ya marca su criterio 2 con el excedente adentro del motivo; acá se cubren
        // `unidad` y `modelo`, donde el techo relevado ya no filtra pero sigue
        // siendo el número que el cliente dijo — callarlo es dejar que el vendedor
        // lea "-2% de precio" sobre un auto que está arriba del presupuesto.
        let porEncima = c.porEncimaDelMaximo === true;
        if (!porEncima && presupuestoMax !== undefined && esNumero(c.unidad.precio) && c.unidad.precio > presupuestoMax) {
            porEncima = true;
            motivo += ` — ${formatearPrecio(c.unidad.precio - presupuestoMax, c.unidad.moneda)} por encima del máximo relevado (+${variacionPorcentual(presupuestoMax, c.unidad.precio)}%)`;
        }
        return porEncima
            ? { unidad: c.unidad, motivo, porEncimaDelMaximo: true }
            : { unidad: c.unidad, motivo };
    });

    // --- 6. Aviso cuando no llegamos a 3. Nunca se rellena. -----------------
    const resultado: ResultadoBusqueda = { alternativas, moneda };
    if (exacta) resultado.exacta = exacta;
    if (estadoDeLaExacta) resultado.estadoDeLaExacta = estadoDeLaExacta;
    if (exacta && presupuestoMax !== undefined && esNumero(exacta.precio) && exacta.precio > presupuestoMax) {
        resultado.exactaPorEncimaDelMaximo = true;
    }
    if (alternativas.length === 0) {
        resultado.aviso = descartadasPorMoneda > 0
            ? `No hay alternativas que cumplan los criterios en ${moneda}. Hay ${descartadasPorMoneda} unidad${descartadasPorMoneda === 1 ? '' : 'es'} disponible${descartadasPorMoneda === 1 ? '' : 's'} publicada${descartadasPorMoneda === 1 ? '' : 's'} en otra moneda, que no se pueden comparar contra este precio.`
            : 'No hay alternativas en el stock disponible que cumplan los criterios.';
    } else if (alternativas.length < MAX_ALTERNATIVAS) {
        const una = alternativas.length === 1;
        resultado.aviso = `Sólo hay ${alternativas.length} alternativa${una ? '' : 's'} que ${una ? 'cumple' : 'cumplen'} los criterios; no se completa con unidades que no correspondan.`;
    }
    return resultado;
}

/** Moneda dominante del stock, para cuando no hay referencia (búsqueda por presupuesto). */
function inferirMoneda(stock: UnidadCandidata[]): string {
    const cuenta = new Map<string, number>();
    for (const u of stock) cuenta.set(u.moneda, (cuenta.get(u.moneda) ?? 0) + 1);
    let mejor = 'ARS';
    let max = -1;
    for (const [m, n] of cuenta) {
        if (n > max) {
            max = n;
            mejor = m;
        }
    }
    return mejor;
}

/**
 * Resuelve qué es "el resultado" de la búsqueda, la MONEDA en la que se compara y,
 * si no está disponible, qué hay que informar. `referencia` es la unidad contra la
 * que se miden las alternativas (existe aunque no esté disponible: si el cliente
 * vino por una unidad vendida, las alternativas se siguen midiendo contra ESA).
 *
 * LA MONEDA SE RESUELVE ACÁ, y no después, por dos motivos:
 *  1. En modo `presupuesto` es un FILTRO DURO que tiene que aplicarse TAMBIÉN a la
 *     exacta. Resolviéndola afuera, la exacta se elegía sobre el stock crudo y un
 *     usado de USD 18.500 entraba en un rango de ARS 25.000.000 por el número
 *     pelado — y encima ganaba el desempate, porque su precio numérico es chico.
 *     El vendedor leía "USD 18.500" como resultado de una búsqueda tipeada en
 *     pesos, con las alternativas en pesos: el resultado y sus alternativas no
 *     eran comparables entre sí.
 *  2. En `unidad` y `modelo` la moneda de comparación LA FIJA la unidad
 *     encontrada, así que no se puede saber antes de encontrarla.
 */
function resolverExacta(
    params: ParamsBusqueda,
    stock: UnidadCandidata[],
): {
    exacta?: UnidadCandidata;
    estadoDeLaExacta?: string;
    referencia?: UnidadCandidata;
    moneda: string;
} {
    if (params.modo === 'unidad') {
        const u = params.unidadBuscada;
        if (!u) return { moneda: params.moneda ?? inferirMoneda(stock) };
        // La moneda de la unidad buscada MANDA sobre la que venga en params: el
        // vendedor no eligió una moneda, resolvió una patente. Comparar el resto
        // del stock contra otra unidad de cuenta dejaba la búsqueda en cero.
        return estaDisponible(u)
            ? { exacta: u, referencia: u, moneda: u.moneda }
            : { estadoDeLaExacta: describirEstado(u), referencia: u, moneda: u.moneda };
    }

    if (params.modo === 'modelo') {
        const marca = normalizarTexto(params.marca);
        const modelo = normalizarTexto(params.modelo);
        const todasDelModelo = stock.filter(
            (u) =>
                (!marca || normalizarTexto(u.marca) === marca) &&
                (!modelo || normalizarTexto(u.modelo) === modelo),
        );
        if (todasDelModelo.length === 0) return { moneda: params.moneda ?? inferirMoneda(stock) };

        // La moneda pedida es una PREFERENCIA, no un filtro: si el único Corolla
        // que hay está en dólares y la atención venía relevada en pesos, lo
        // correcto es mostrarlo (el cliente pidió ese modelo, no esa moneda). Lo
        // que no puede pasar es que la exacta salga en una moneda y las
        // alternativas en otra, y por eso la moneda final es la de la elegida.
        const preferidas = params.moneda ? todasDelModelo.filter((u) => u.moneda === params.moneda) : [];
        const delModelo = preferidas.length > 0 ? preferidas : todasDelModelo;

        // Se afina con versión y año si el vendedor los dio, pero sin dejar
        // al cliente sin respuesta: si nada matchea exacto, vale el modelo.
        const afinadas = delModelo.filter(
            (u) =>
                (!params.version || normalizarTexto(u.version) === normalizarTexto(params.version)) &&
                (!params.anio || u.anio === params.anio),
        );
        const candidatas = afinadas.length > 0 ? afinadas : delModelo;

        const disponibles = candidatas.filter(estaDisponible);
        if (disponibles.length > 0) {
            const mejor = [...disponibles].sort(
                (a, b) =>
                    puntajeAnioKm(b) - puntajeAnioKm(a) ||
                    (a.precio ?? Infinity) - (b.precio ?? Infinity) ||
                    a.id - b.id,
            )[0];
            return { exacta: mejor, referencia: mejor, moneda: mejor.moneda };
        }

        // Hay unidades de ese modelo pero ninguna se puede ofrecer: hay que decirlo.
        const detalle = candidatas.map((u) => describirEstado(u).replace(/^está /, '')).join(', ');
        const nombre = [params.marca, params.modelo].filter(Boolean).join(' ') || nombrar(candidatas[0]);
        return {
            estadoDeLaExacta: `${nombre}: ${candidatas.length} unidad${candidatas.length === 1 ? '' : 'es'} en stock, ninguna disponible (${detalle})`,
            referencia: candidatas[0],
            moneda: candidatas[0].moneda,
        };
    }

    // Modo presupuesto: el "resultado" es la mejor unidad del rango, Y EN LA MONEDA
    // DEL RANGO. Acá la moneda sí es filtro duro: el rango que tipeó el vendedor
    // está expresado en ella.
    const moneda = params.moneda ?? inferirMoneda(stock);
    const min = esNumero(params.presupuestoMin) ? params.presupuestoMin : -Infinity;
    const max = esNumero(params.presupuestoMax) ? params.presupuestoMax : Infinity;
    const enRango = stock.filter(
        (u) =>
            estaDisponible(u) &&
            u.moneda === moneda &&
            esNumero(u.precio) &&
            u.precio >= min &&
            u.precio <= max,
    );
    if (enRango.length === 0) return { moneda };
    const mejor = [...enRango].sort(
        (a, b) => puntajeAnioKm(b) - puntajeAnioKm(a) || (a.precio ?? 0) - (b.precio ?? 0) || a.id - b.id,
    )[0];
    // Sin `referencia`: en una búsqueda por presupuesto no hay "unidad buscada"
    // contra la cual medir, y aplicar "peor en todos los ejes" contra la mejor del
    // rango descartaría de entrada todo lo más barato, que es justo lo que puede
    // servir. Los criterios del modo presupuesto no necesitan referencia.
    return { exacta: mejor, moneda };
}
