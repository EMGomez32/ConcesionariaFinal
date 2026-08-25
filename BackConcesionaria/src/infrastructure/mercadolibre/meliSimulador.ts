import type { EstadoPublicacionMl, EstadoPreguntaMl, MercadoLibreCuenta, PreguntaMl, PublicacionMl } from '@prisma/client';
import prisma from '../database/prisma';
import { MeliError } from './meliClient';

/**
 * Red simulada de Mercado Libre para las cuentas en modo `demo`.
 *
 * POR QUÉ EXISTE: crear la aplicación en developers.mercadolibre.com.ar exige
 * validar la identidad del titular (no es un trámite de minutos) y, aun
 * teniéndola, demostrar el circuito contra la API real publicaría avisos DE
 * VERDAD: cuestan plata y quedan públicos bajo la cuenta del vendedor. El
 * criterio es el mismo que ya usa AFIP con su CAE simulado.
 *
 * DÓNDE SE ENGANCHA: en `llamarApi`, el único punto por el que sale TODA la
 * comunicación con Mercado Libre. Así el modo demostración recorre exactamente
 * el mismo código de negocio que el modo real (publicar, pausar, cerrar,
 * reconciliar, responder) y no se duplica ni una regla: lo que se demuestra es
 * el circuito verdadero con la red simulada.
 *
 * REGLA DE INTEGRIDAD: nada de lo que devuelve este módulo puede confundirse con
 * un dato real. Los ids llevan prefijo `DEMO-` para que se distingan a simple
 * vista de un `MLA123456789`, y el `permalink` de un item simulado es NULL —
 * inventar una URL con pinta de articulo.mercadolibre.com.ar sería exactamente
 * el dato falso que este módulo no puede producir.
 *
 * Sin estado en memoria: la fuente de verdad es la base (la fila `PublicacionMl`
 * y las `PreguntaMl` del tenant). Por eso "Sincronizar" y la reconciliación
 * devuelven algo coherente en vez de un item que se inventó de cero.
 *
 * Las lecturas van por el `prisma` extendido —igual que el resto del módulo— y
 * ADEMÁS filtran `concesionariaId` a mano: para un super_admin la extensión no
 * inyecta tenant, y sin ese filtro el simulador podría responder con el item de
 * otra concesionaria.
 */

/** Categoría única que devuelve el predictor simulado. */
const CATEGORIA_DEMO = 'DEMO-CAT-AUTOS';

/** Moneda con la que cobra cada sitio (la de los costos de publicación). */
const MONEDA_DEL_SITIO: Record<string, string> = {
    MLA: 'ARS',
    MLU: 'UYU',
    MLC: 'CLP',
};

/**
 * Bandas de costo por tipo de publicación, en la moneda del sitio.
 *
 * Elegir el tipo sabiendo cuánto cuesta es el corazón de lo que se demuestra, así
 * que los tres tienen que salir DISTINTOS y acompañar el precio del auto. El
 * cargo de Mercado Libre no es un porcentaje plano sino un cargo por paquete que
 * escala con el aviso: se replica con un porcentaje acotado por una banda. La
 * banda además rescata el caso del auto publicado en dólares — el porcentaje
 * sobre un precio en USD daría un número ridículo en pesos, y el piso lo lleva a
 * un valor verosímil.
 */
const TARIFAS_DEMO = [
    { listingTypeId: 'free', nombre: 'Gratuita', publicacion: null, venta: null },
    { listingTypeId: 'gold_special', nombre: 'Clásica', publicacion: { tasa: 0.008, piso: 20_000, techo: 250_000 }, venta: { tasa: 0.045, piso: 60_000, techo: 2_000_000 } },
    { listingTypeId: 'gold_pro', nombre: 'Premium', publicacion: { tasa: 0.020, piso: 55_000, techo: 600_000 }, venta: { tasa: 0.105, piso: 150_000, techo: 4_500_000 } },
] as const;

/**
 * Atributos de la categoría de autos, con `tags.required` en los que de verdad
 * son obligatorios. No es decorativo: `opcionesDePublicacion` calcula con esto
 * qué datos le faltan al vehículo, así que la pantalla previa muestra faltantes
 * DE VERDAD (un auto sin año o sin kilómetros los ve marcados).
 *
 * Los `values[].id` también llevan prefijo DEMO-: son los que viajarían en el
 * payload del item, y un id con forma de id real de Mercado Libre sería un dato
 * inventado más.
 */
const ATRIBUTOS_DEMO = [
    {
        id: 'BRAND',
        name: 'Marca',
        value_type: 'list',
        tags: { required: true },
        values: [
            { id: 'DEMO-BRAND-CHEVROLET', name: 'Chevrolet' },
            { id: 'DEMO-BRAND-FIAT', name: 'Fiat' },
            { id: 'DEMO-BRAND-FORD', name: 'Ford' },
            { id: 'DEMO-BRAND-PEUGEOT', name: 'Peugeot' },
            { id: 'DEMO-BRAND-RENAULT', name: 'Renault' },
            { id: 'DEMO-BRAND-TOYOTA', name: 'Toyota' },
            { id: 'DEMO-BRAND-VOLKSWAGEN', name: 'Volkswagen' },
        ],
    },
    { id: 'MODEL', name: 'Modelo', value_type: 'string', tags: { required: true } },
    { id: 'VEHICLE_YEAR', name: 'Año', value_type: 'number', tags: { required: true } },
    { id: 'KILOMETERS', name: 'Kilómetros', value_type: 'number_unit', tags: { required: true } },
    { id: 'TRIM', name: 'Versión', value_type: 'string', tags: {} },
    {
        id: 'COLOR',
        name: 'Color',
        value_type: 'list',
        tags: {},
        values: [
            { id: 'DEMO-COLOR-BLANCO', name: 'Blanco' },
            { id: 'DEMO-COLOR-NEGRO', name: 'Negro' },
            { id: 'DEMO-COLOR-GRIS', name: 'Gris' },
            { id: 'DEMO-COLOR-PLATA', name: 'Plata' },
            { id: 'DEMO-COLOR-ROJO', name: 'Rojo' },
            { id: 'DEMO-COLOR-AZUL', name: 'Azul' },
        ],
    },
    {
        id: 'FUEL_TYPE',
        name: 'Combustible',
        value_type: 'list',
        tags: {},
        values: [
            { id: 'DEMO-FUEL-NAFTA', name: 'Nafta' },
            { id: 'DEMO-FUEL-DIESEL', name: 'Diésel' },
            { id: 'DEMO-FUEL-GNC', name: 'GNC' },
            { id: 'DEMO-FUEL-HIBRIDO', name: 'Híbrido' },
            { id: 'DEMO-FUEL-ELECTRICO', name: 'Eléctrico' },
        ],
    },
    {
        id: 'TRANSMISSION',
        name: 'Transmisión',
        value_type: 'list',
        tags: {},
        values: [
            { id: 'DEMO-TRANS-MANUAL', name: 'Manual' },
            { id: 'DEMO-TRANS-AUTOMATICA', name: 'Automática' },
        ],
    },
    {
        id: 'DOORS',
        name: 'Puertas',
        value_type: 'list',
        tags: {},
        values: [
            { id: 'DEMO-DOORS-2', name: '2' },
            { id: 'DEMO-DOORS-3', name: '3' },
            { id: 'DEMO-DOORS-4', name: '4' },
            { id: 'DEMO-DOORS-5', name: '5' },
        ],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface InitSimulado {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | undefined>;
}

/**
 * Secuencia dentro del proceso. Va junto al timestamp porque dos publicaciones
 * disparadas en el mismo milisegundo chocarían contra el unique
 * `[concesionariaId, itemId]` y una de las dos moriría con un P2002 delante del
 * comprador.
 */
let secuenciaItem = 0;

const objeto = (valor: unknown): Record<string, unknown> =>
    (valor !== null && typeof valor === 'object' ? valor as Record<string, unknown> : {});

const numeroOpcional = (valor: unknown): number | null => {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
};

/** Redondeo a centenas: un costo con decimales al azar no se lee como un precio. */
const aCentenas = (valor: number): number => Math.round(valor / 100) * 100;

const acotar = (valor: number, piso: number, techo: number): number =>
    Math.min(Math.max(valor, piso), techo);

/**
 * Nickname de fantasía ESTABLE para un user_id: el mismo id devuelve siempre el
 * mismo apodo (si cambiara en cada llamada, la bandeja mostraría un nombre
 * distinto por pregunta y se notaría que no hay nadie del otro lado).
 */
const NOMBRES_DEMO = [
    'COMPRADOR_DEMO_AR', 'INTERESADO_SIM', 'CONSULTA_DEMO', 'VISITANTE_SIM',
    'USUARIO_DEMO_MZA', 'CLIENTE_SIM_AR', 'PREGUNTA_DEMO', 'CONTACTO_SIM',
];

function nicknameDeFantasia(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return `${NOMBRES_DEMO[h % NOMBRES_DEMO.length]}_${String(h % 1000).padStart(3, '0')}`;
}

/** Estados nuestros → `status` del item tal como lo devolvería la API. */
function statusDeItem(estado: EstadoPublicacionMl): string {
    switch (estado) {
        case 'pausada': return 'paused';
        case 'cerrada': return 'closed';
        // 'borrador' y 'error' son estados de un intento LOCAL, no del item: si
        // hay itemId el aviso existe en la red simulada, y existir es estar
        // activo. `estadoDesdeMl` traduce esto de vuelta y repara la fila.
        default: return 'active';
    }
}

/** Estados nuestros → `status` de la pregunta (api_version 4). */
function statusDePregunta(estado: EstadoPreguntaMl): string {
    switch (estado) {
        case 'respondida': return 'ANSWERED';
        case 'eliminada': return 'DELETED';
        default: return 'UNANSWERED';
    }
}

/** Item con la forma que espeja `meliPublicacion` (id, permalink, status, price, currency_id). */
function itemDesdePublicacion(
    publicacion: PublicacionMl,
    sobreescribir: { status?: string; price?: number } = {},
): Record<string, unknown> {
    const precio = publicacion.precioPublicado == null ? null : Number(publicacion.precioPublicado);
    return {
        id: publicacion.itemId,
        // NULL a propósito: un aviso simulado no existe fuera del sistema y no
        // puede tener un link que parezca de Mercado Libre.
        permalink: null,
        status: sobreescribir.status ?? statusDeItem(publicacion.estado),
        // Se omite el precio si nunca se registró: `typeof price === 'number'`
        // es lo que decide si el servicio pisa el valor local o lo conserva.
        ...(sobreescribir.price != null ? { price: sobreescribir.price } : precio != null ? { price: precio } : {}),
        ...(publicacion.monedaPublicada ? { currency_id: publicacion.monedaPublicada } : {}),
    };
}

/** Pregunta con la forma de `/questions/search` y `/questions/{id}` (api_version 4). */
function preguntaApi(cuenta: MercadoLibreCuenta, pregunta: PreguntaMl): Record<string, unknown> {
    const desde = pregunta.mlFromUserId ?? `DEMO-U-${pregunta.id}`;
    return {
        id: pregunta.mlQuestionId,
        // El webhook valida la pertenencia por acá; se manda igual que la API real.
        seller_id: cuenta.mlUserId,
        text: pregunta.texto,
        status: statusDePregunta(pregunta.estado),
        date_created: pregunta.preguntadaEn.toISOString(),
        item_id: pregunta.itemId,
        from: {
            id: desde,
            // El nickname viaja embebido (la API v4 también lo hace) para que
            // re-ingerir no le cambie el nombre al interesado ni gaste una
            // llamada extra a /users/{id}.
            nickname: pregunta.nombreContacto ?? nicknameDeFantasia(desde),
        },
        answer: pregunta.respuesta
            ? {
                text: pregunta.respuesta,
                status: 'ACTIVE',
                date_created: (pregunta.respondidaEn ?? pregunta.updatedAt).toISOString(),
            }
            : null,
    };
}

async function publicacionPorItemId(cuenta: MercadoLibreCuenta, itemId: string): Promise<PublicacionMl> {
    const publicacion = await prisma.publicacionMl.findFirst({
        where: { itemId, concesionariaId: cuenta.concesionariaId },
    });
    // Mismo 404 que daría Mercado Libre con un item inexistente, y el que
    // `sincronizarPublicacion` traduce a "cerrada" en vez de a una falla.
    if (!publicacion) throw new MeliError(`El item ${itemId} no existe en la demostración`, 404);
    return publicacion;
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints simulados
// ─────────────────────────────────────────────────────────────────────────────

/** GET /sites/{site}/listing_prices — los tres tipos con su costo derivado del precio. */
function listingPrices(siteId: string, query: InitSimulado['query']): Array<Record<string, unknown>> {
    const precio = numeroOpcional(query?.price) ?? 0;
    const moneda = MONEDA_DEL_SITIO[siteId] ?? 'ARS';
    return TARIFAS_DEMO.map((t) => ({
        listing_type_id: t.listingTypeId,
        listing_type_name: t.nombre,
        // Sin precio (vehículo sin precio de lista) Mercado Libre tampoco puede
        // calcular la comisión: se muestra el piso del cargo y comisión 0, que es
        // lo que hace la API real con un `price` ausente.
        listing_fee_amount: t.publicacion ? aCentenas(acotar(precio * t.publicacion.tasa, t.publicacion.piso, t.publicacion.techo)) : 0,
        sale_fee_amount: t.venta && precio > 0 ? aCentenas(acotar(precio * t.venta.tasa, t.venta.piso, t.venta.techo)) : 0,
        currency_id: moneda,
    }));
}

/** POST /items — alta del aviso simulado. */
function crearItem(body: unknown): Record<string, unknown> {
    const datos = objeto(body);
    secuenciaItem += 1;
    // `DEMO-` + base36 del reloj: corto, ordenado en el tiempo e imposible de
    // confundir con un MLA123456789 de un vistazo.
    const id = `DEMO-${Date.now().toString(36).toUpperCase()}-${secuenciaItem}`;
    return {
        id,
        status: 'active',
        permalink: null,
        ...(typeof datos.price === 'number' ? { price: datos.price } : {}),
        ...(typeof datos.currency_id === 'string' ? { currency_id: datos.currency_id } : {}),
    };
}

/**
 * PUT /items/{id} — aplica lo que llega en el body y devuelve el item resultante.
 *
 * NO escribe la fila `PublicacionMl`: el servicio de negocio ya la actualiza con
 * esta respuesta. Si el simulador también escribiera, habría dos autores del
 * mismo estado y el modo demo dejaría de recorrer el camino real.
 */
async function actualizarItem(cuenta: MercadoLibreCuenta, itemId: string, body: unknown): Promise<Record<string, unknown>> {
    const publicacion = await publicacionPorItemId(cuenta, itemId);
    const datos = objeto(body);
    const status = typeof datos.status === 'string' ? datos.status : undefined;
    const price = typeof datos.price === 'number' ? datos.price : undefined;
    return itemDesdePublicacion(publicacion, { status, price });
}

/** GET /questions/search — las preguntas demo de la cuenta, con la forma de la API v4. */
async function buscarPreguntas(cuenta: MercadoLibreCuenta, query: InitSimulado['query']): Promise<Record<string, unknown>> {
    const estado = estadoPedido(query?.status);
    const limit = numeroOpcional(query?.limit) ?? 50;
    const offset = numeroOpcional(query?.offset) ?? 0;

    const where = { cuentaId: cuenta.id, concesionariaId: cuenta.concesionariaId, ...(estado ? { estado } : {}) };
    const [preguntas, total] = await Promise.all([
        prisma.preguntaMl.findMany({
            where,
            // Más nuevas primero, igual que el `sort_types: DESC` que pide el
            // servicio: es el orden en el que la bandeja las va a mostrar.
            orderBy: [{ preguntadaEn: 'desc' }, { id: 'desc' }],
            skip: offset,
            take: limit,
        }),
        prisma.preguntaMl.count({ where }),
    ]);

    return { total, questions: preguntas.map((p) => preguntaApi(cuenta, p)) };
}

/** El `status` de la búsqueda es de Mercado Libre; acá se traduce al nuestro. */
function estadoPedido(status: string | number | undefined): EstadoPreguntaMl | undefined {
    switch (String(status ?? '').toUpperCase()) {
        case 'UNANSWERED': return 'sin_responder';
        case 'ANSWERED': return 'respondida';
        default: return undefined;
    }
}

/** POST /answers — acepta la respuesta. La fila la actualiza el servicio, no el simulador. */
async function responder(cuenta: MercadoLibreCuenta, body: unknown): Promise<Record<string, unknown>> {
    const datos = objeto(body);
    const questionId = datos.question_id == null ? '' : String(datos.question_id);
    const texto = typeof datos.text === 'string' ? datos.text : '';

    const pregunta = await prisma.preguntaMl.findFirst({
        where: { mlQuestionId: questionId, concesionariaId: cuenta.concesionariaId },
        select: { id: true, estado: true },
    });
    if (!pregunta) throw new MeliError(`La pregunta ${questionId} no existe en la demostración`, 404);
    // Mismo rechazo que daría Mercado Libre: una pregunta cerrada o borrada ya no
    // se puede contestar. El servicio ya lo corta antes, esto es el espejo.
    if (pregunta.estado === 'eliminada') {
        throw new MeliError('La pregunta ya no admite respuesta', 400);
    }
    // Y la regla que la propia pantalla afirma: Mercado Libre admite UNA sola
    // respuesta por pregunta. Sin esto la plataforma simulada era más permisiva
    // que la que dice reproducir, que es justo lo que se demuestra acá.
    if (pregunta.estado === 'respondida') {
        throw new MeliError('La pregunta ya fue respondida: no se admite una segunda respuesta', 400);
    }

    return { id: `DEMO-A-${pregunta.id}`, question_id: questionId, text: texto, status: 'ACTIVE' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ruteo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Responde una llamada de una cuenta en modo demostración. NUNCA hace fetch:
 * cualquier ruta no contemplada termina en un 501 explícito, jamás en un pedido
 * a la red (esa es la garantía que hace que el modo demo no pueda publicar un
 * aviso de verdad ni consumir la cuota de nadie).
 */
export async function simularLlamada<T>(
    cuenta: MercadoLibreCuenta,
    ruta: string,
    init: InitSimulado = {},
): Promise<T> {
    const metodo = (init.method ?? 'GET').toUpperCase();
    const partes = ruta.split('?')[0].split('/').filter(Boolean);
    const respuesta = await resolver(cuenta, metodo, partes, init);
    return respuesta as unknown as T;
}

async function resolver(
    cuenta: MercadoLibreCuenta,
    metodo: string,
    partes: string[],
    init: InitSimulado,
): Promise<unknown> {
    const [raiz, segundo, tercero, cuarto] = partes;

    if (raiz === 'users' && metodo === 'GET') {
        // /users/me: el propio registro de la cuenta, que es de donde el alta
        // saca el nickname y el sitio para mostrarlos en Configuración.
        if (segundo === 'me') {
            return { id: cuenta.mlUserId, nickname: cuenta.nickname ?? 'VENDEDOR_DEMO', site_id: cuenta.siteId };
        }
        if (segundo) return { id: segundo, nickname: nicknameDeFantasia(segundo) };
    }

    if (raiz === 'sites' && segundo && metodo === 'GET') {
        if (tercero === 'domain_discovery' && cuarto === 'search') {
            return [{ category_id: CATEGORIA_DEMO, domain_name: 'DEMO-DOM-AUTOS_Y_CAMIONETAS' }];
        }
        if (tercero === 'listing_prices') return listingPrices(segundo, init.query);
    }

    if (raiz === 'categories' && segundo && metodo === 'GET') {
        // El nombre es cosmético pero se muestra en la pantalla de opciones: que
        // diga "simulada" es parte de que nada se pueda confundir con real.
        if (!tercero) return { id: segundo, name: 'Autos y Camionetas (categoría simulada)' };
        if (tercero === 'attributes') return ATRIBUTOS_DEMO;
    }

    if (raiz === 'items') {
        if (!segundo && metodo === 'POST') return crearItem(init.body);
        if (segundo && metodo === 'GET') return itemDesdePublicacion(await publicacionPorItemId(cuenta, segundo));
        if (segundo && metodo === 'PUT') return actualizarItem(cuenta, segundo, init.body);
    }

    if (raiz === 'questions' && segundo && metodo === 'GET') {
        if (segundo === 'search') return buscarPreguntas(cuenta, init.query);
        const pregunta = await prisma.preguntaMl.findFirst({
            where: { mlQuestionId: segundo, concesionariaId: cuenta.concesionariaId },
        });
        if (!pregunta) throw new MeliError(`La pregunta ${segundo} no existe en la demostración`, 404);
        return preguntaApi(cuenta, pregunta);
    }

    if (raiz === 'answers' && !segundo && metodo === 'POST') return responder(cuenta, init.body);

    throw new MeliError(
        `El modo demostración no simula el endpoint ${metodo} /${partes.join('/')} de Mercado Libre: la cuenta demo no sale a la red, así que esta operación no se puede mostrar sin credenciales reales.`,
        501,
    );
}
