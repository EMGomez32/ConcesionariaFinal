import { EstadoPublicacionMl, EstadoVehiculo, MercadoLibreCuenta, Prisma, PublicacionMl } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { withTenantTransaction } from '../../infrastructure/database/unitOfWork';
import { env } from '../../config/env';
import { logger } from '../../infrastructure/logging/logger';
import { BaseException, NotFoundException } from '../../domain/exceptions/BaseException';
import {
    AtributoCategoria,
    MeliError,
    atributosDeCategoria,
    esAtributoRequerido,
    llamarApi,
    sugerirCategoria,
} from '../../infrastructure/mercadolibre/meliClient';

/**
 * Publicación de vehículos en Mercado Libre: el lado de NEGOCIO del canal.
 *
 * Dos caminos entran acá y se comportan distinto a propósito:
 *  - Los que dispara el usuario con un botón (opciones / publicar / pausar /
 *    reactivar / cerrar / sincronizar): si Mercado Libre rechaza, la excepción
 *    SE PROPAGA. El mensaje de ML ya viene con su `cause[]` concatenado por
 *    `llamarApi`, y ahí es donde dice qué atributo falta: tragarlo dejaría al
 *    usuario adivinando por qué no se publicó.
 *  - El efecto lateral automático (`sincronizarPorVehiculo`), que cuelga de la
 *    edición de un vehículo: es best-effort y NUNCA tira. Que Mercado Libre esté
 *    caído no puede hacer fallar el guardado de un precio en el stock.
 *
 * Nada de esto corre sin contexto de tenant: todas las lecturas y escrituras van
 * por el `prisma` extendido. Si algún camino sin request necesita llamar acá,
 * tiene que envolverlo en `conContextoSistema(concesionariaId, ...)` — sin las
 * GUC de RLS las consultas devuelven CERO filas en silencio.
 */

/** Tope de caracteres del título de un item en Mercado Libre. */
const LARGO_TITULO = 60;

/** Los mensajes de error de ML son largos (traen el `cause[]`), pero el detalle
 *  es justamente lo que el usuario necesita leer: se recorta generoso. */
const LARGO_ERROR = 500;

/** Un item existe en ML mientras no esté cerrado; 'error' y 'borrador' son
 *  estados locales de un intento que puede reintentarse. */
const ESTADOS_VIVOS: EstadoPublicacionMl[] = ['borrador', 'activa', 'pausada', 'error'];

/**
 * Estados del vehículo con los que NO se publica. La invariante ya existía al
 * revés (reservado ⇒ pausar, vendido ⇒ cerrar, más abajo): sin este chequeo el
 * sistema creaba de cero justo el estado que después trata como una avería.
 */
const ESTADOS_NO_PUBLICABLES: EstadoVehiculo[] = ['reservado', 'vendido', 'devuelto'];

/** Namespace del advisory lock que serializa el publicar de un mismo vehículo. */
const CANDADO_PUBLICACION_ML = 811001;

/**
 * Un 'borrador' más nuevo que esto es un intento EN CURSO contra la API de ML
 * (el POST /items tarda segundos). Pasada la ventana se da por abandonado —
 * sólo queda así si el proceso se cayó en el medio— y se puede reintentar.
 */
const VENTANA_PUBLICACION_EN_CURSO_MS = 2 * 60 * 1000;

/**
 * Atributos que ML da por completados con campos de primer nivel del item, no
 * con el array `attributes`: pedirlos aparte haría que la pantalla de opciones
 * marque como "faltante" algo que sí estamos mandando.
 */
const ATRIBUTOS_QUE_CUBRE_EL_ITEM = new Set(['ITEM_CONDITION']);

/** Tipos que se ofrecen si `listing_prices` no responde: los dos universales. */
const TIPOS_DE_RESPALDO: Array<{ listingTypeId: string; nombre: string }> = [
    { listingTypeId: 'gold_special', nombre: 'Clásica' },
    { listingTypeId: 'free', nombre: 'Gratuita' },
];

export interface TipoDePublicacion {
    listingTypeId: string;
    nombre: string;
    costoPublicacion: number | null;
    comisionVenta: number | null;
    moneda: string;
}

export interface OpcionesPublicacion {
    vehiculoId: number;
    titulo: string;
    categoriaId: string | null;
    categoriaNombre: string | null;
    precio: number | null;
    moneda: string;
    fotos: number;
    atributosFaltantes: Array<{ id: string; nombre: string }>;
    advertencias: string[];
    tipos: TipoDePublicacion[];
}

type VehiculoParaPublicar = Prisma.VehiculoGetPayload<{ include: { archivos: true; sucursal: true } }>;

/** Respuesta de /items y de /items/{id} recortada a lo que espejamos. */
interface ItemMl {
    id?: string;
    permalink?: string;
    status?: string;
    price?: number;
    currency_id?: string;
}

interface PrecioDePublicacion {
    listing_type_id?: string;
    listing_type_name?: string;
    listing_fee_amount?: number;
    sale_fee_amount?: number;
    currency_id?: string;
}

interface AtributoAEnviar {
    id: string;
    value_name?: string;
    value_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const mensajeCorto = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err)).slice(0, LARGO_ERROR);

const juntar = (partes: Array<string | number | null | undefined>, separador: string): string =>
    partes
        .map((p) => (p == null ? '' : String(p).trim()))
        .filter((p) => p !== '')
        .join(separador);

const colapsarEspacios = (texto: string): string => texto.replace(/\s+/g, ' ').trim();

const baseUrlPublica = (): string => env.APP_URL.replace(/\/$/, '');

/**
 * Las urls de VehiculoArchivo son relativas: para que ML descargue la foto hay
 * que anteponer APP_URL. Si APP_URL es local, ML no llega — no es un error del
 * usuario, es la configuración del entorno, así que se avisa y se publica sin
 * fotos en vez de romper.
 */
const appUrlEsLocal = (): boolean => /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(baseUrlPublica());

const esImagen = (mimeType: string | null): boolean => !!mimeType && mimeType.startsWith('image/');

/** Fotos publicables, con la principal primero (es la portada del aviso). */
const fotosDelVehiculo = (vehiculo: VehiculoParaPublicar) =>
    vehiculo.archivos
        .filter((a) => esImagen(a.mimeType))
        .sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal) || a.id - b.id);

const tituloSugerido = (vehiculo: VehiculoParaPublicar): string =>
    colapsarEspacios(juntar([vehiculo.marca, vehiculo.modelo, vehiculo.version, vehiculo.anio], ' '))
        .slice(0, LARGO_TITULO)
        .trim();

const aNumero = (valor: Prisma.Decimal | null): number | null => (valor == null ? null : Number(valor));

/**
 * Ficha para la descripción del aviso. No se incluye el teléfono de la sucursal:
 * Mercado Libre ya muestra el contacto del vendedor en los clasificados y hay
 * categorías donde un teléfono en el texto hace rebotar la publicación.
 */
function descripcionDelVehiculo(vehiculo: VehiculoParaPublicar): string {
    const ficha = juntar([
        `Marca: ${vehiculo.marca}`,
        `Modelo: ${vehiculo.modelo}`,
        vehiculo.version ? `Versión: ${vehiculo.version}` : null,
        vehiculo.anio ? `Año: ${vehiculo.anio}` : null,
        vehiculo.kmIngreso != null ? `Kilómetros: ${vehiculo.kmIngreso}` : null,
        vehiculo.color ? `Color: ${vehiculo.color}` : null,
        `Condición: ${vehiculo.tipo === 'CERO_KM' ? '0 km' : 'Usado'}`,
    ], '\n');

    const sucursal = juntar([vehiculo.sucursal?.nombre, vehiculo.sucursal?.ciudad], ' - ');

    return juntar([ficha, vehiculo.observaciones, sucursal ? `Nos encontrás en: ${sucursal}` : null], '\n\n');
}

/**
 * Valores de atributos que sabemos completar con los datos del stock. Es el
 * ÚNICO mapeo: `opcionesDePublicacion` lo usa para calcular qué falta y
 * `publicarVehiculo` para armar el payload, así que la pantalla previa no puede
 * mentirle al usuario sobre lo que se va a mandar.
 */
function valoresDeAtributos(vehiculo: VehiculoParaPublicar): Record<string, string> {
    const valores: Record<string, string> = {};
    const marca = vehiculo.marca?.trim();
    const modelo = vehiculo.modelo?.trim();
    const version = vehiculo.version?.trim();
    const color = vehiculo.color?.trim();

    if (marca) valores.BRAND = marca;
    if (modelo) valores.MODEL = modelo;
    if (version) valores.TRIM = version;
    if (vehiculo.anio != null) valores.VEHICLE_YEAR = String(vehiculo.anio);
    if (vehiculo.kmIngreso != null) valores.KILOMETERS = `${vehiculo.kmIngreso} km`;
    if (color) valores.COLOR = color;
    return valores;
}

/**
 * Arma el array `attributes`. Si la categoría declara una lista cerrada de
 * valores se intenta matchear por nombre y mandar el `value_id` (es lo que ML
 * prefiere y lo que evita el rechazo por "valor inválido"); si no matchea se
 * manda igual el `value_name` y decide ML: preferimos un error explícito de ML
 * antes que omitir el dato y publicar un aviso incompleto.
 */
function atributosParaMl(
    valores: Record<string, string>,
    atributosCategoria: AtributoCategoria[],
): AtributoAEnviar[] {
    const porId = new Map(atributosCategoria.map((a) => [a.id, a]));
    return Object.entries(valores).map(([id, valor]) => {
        const definicion = porId.get(id);
        const opcion = definicion?.values?.find((v) => v.name.trim().toLowerCase() === valor.trim().toLowerCase());
        return opcion ? { id, value_id: opcion.id } : { id, value_name: valor };
    });
}

/** Obligatorios de la categoría que no podemos completar solos. */
function atributosFaltantes(
    valores: Record<string, string>,
    atributosCategoria: AtributoCategoria[],
): Array<{ id: string; nombre: string }> {
    return atributosCategoria
        .filter((a) => esAtributoRequerido(a))
        .filter((a) => !ATRIBUTOS_QUE_CUBRE_EL_ITEM.has(a.id))
        .filter((a) => !valores[a.id])
        .map((a) => ({ id: a.id, nombre: a.name }));
}

/** ML tiene más estados que nosotros; los que no espejamos devuelven null (no tocar). */
function estadoDesdeMl(status: string | undefined): EstadoPublicacionMl | null {
    switch (status) {
        case 'active': return 'activa';
        case 'paused': return 'pausada';
        case 'closed': return 'cerrada';
        case 'inactive': return 'cerrada';
        default: return null;
    }
}

async function buscarCuenta(cuentaId: number): Promise<MercadoLibreCuenta> {
    const cuenta = await prisma.mercadoLibreCuenta.findFirst({ where: { id: cuentaId } });
    if (!cuenta) throw new NotFoundException('Cuenta de Mercado Libre');
    return cuenta;
}

async function buscarVehiculo(vehiculoId: number): Promise<VehiculoParaPublicar> {
    const vehiculo = await prisma.vehiculo.findFirst({
        where: { id: vehiculoId },
        // La extensión sólo filtra borrados en el where de primer nivel: el
        // include de archivos lleva el suyo o cuenta fotos ya eliminadas.
        include: { archivos: { where: { deletedAt: null } }, sucursal: true },
    });
    if (!vehiculo) throw new NotFoundException('Vehículo');
    return vehiculo;
}

async function buscarPublicacion(publicacionId: number): Promise<PublicacionMl> {
    const publicacion = await prisma.publicacionMl.findFirst({ where: { id: publicacionId } });
    if (!publicacion) throw new NotFoundException('Publicación de Mercado Libre');
    return publicacion;
}

function exigirItemId(publicacion: PublicacionMl): string {
    if (!publicacion.itemId) {
        throw new BaseException(
            409,
            'La publicación nunca llegó a Mercado Libre (quedó en borrador): volvé a publicar el vehículo.',
            'PUBLICACION_ML_SIN_ITEM',
        );
    }
    return publicacion.itemId;
}

/** Deja rastro del error sin tocar el estado (el item en ML sigue como estaba). */
async function registrarUltimoError(publicacionId: number, err: unknown): Promise<void> {
    await prisma.publicacionMl
        .update({ where: { id: publicacionId }, data: { ultimoError: mensajeCorto(err) } })
        .catch(() => undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// Opciones previas a publicar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Todo lo que la pantalla de "Publicar en Mercado Libre" necesita mostrar ANTES
 * de que el usuario apriete el botón: título sugerido, categoría, qué falta y
 * cuánto cuesta cada tipo de publicación.
 *
 * Los costos se piden EN VIVO a ML (cambian por categoría, precio y promociones);
 * hardcodearlos sería mostrarle al usuario un número que no va a pagar. Si ML no
 * contesta, se devuelven los dos tipos universales con costo desconocido y una
 * advertencia: la pantalla tiene que poder abrirse igual.
 */
export async function opcionesDePublicacion(cuentaId: number, vehiculoId: number): Promise<OpcionesPublicacion> {
    const cuenta = await buscarCuenta(cuentaId);
    const vehiculo = await buscarVehiculo(vehiculoId);
    const advertencias: string[] = [];

    const titulo = tituloSugerido(vehiculo);
    const precio = aNumero(vehiculo.precioLista);
    const moneda = vehiculo.moneda || 'ARS';
    const fotos = fotosDelVehiculo(vehiculo);

    if (precio == null) {
        advertencias.push('El vehículo no tiene precio de lista: cargalo antes de publicar, Mercado Libre lo exige.');
    }
    if (fotos.length === 0) {
        advertencias.push('El vehículo no tiene fotos cargadas: un aviso sin fotos casi no recibe consultas.');
    } else if (appUrlEsLocal()) {
        advertencias.push(
            `Las fotos no se van a subir: APP_URL (${baseUrlPublica()}) apunta a una dirección local y Mercado Libre no puede descargarlas desde internet.`,
        );
    }
    if (ESTADOS_NO_PUBLICABLES.includes(vehiculo.estado)) {
        advertencias.push(`El vehículo está en estado "${vehiculo.estado}": no se puede publicar una unidad que no está disponible.`);
    } else if (vehiculo.estado !== 'publicado') {
        advertencias.push(`El vehículo está en estado "${vehiculo.estado}": revisá que corresponda publicarlo.`);
    }

    // Categoría: se pregunta al predictor de ML en vez de fijarla, porque cambia
    // por país y por tipo de vehículo. Un fallo acá no debe cerrar la pantalla:
    // el usuario todavía puede mandar la categoría a mano al publicar.
    let categoriaId: string | null = null;
    try {
        categoriaId = await sugerirCategoria(cuentaId, juntar([vehiculo.marca, vehiculo.modelo, vehiculo.anio], ' '), cuenta.siteId);
    } catch (err) {
        advertencias.push(`No se pudo consultar la categoría en Mercado Libre: ${mensajeCorto(err)}`);
    }
    if (!categoriaId) {
        advertencias.push('Mercado Libre no pudo sugerir una categoría para este vehículo: vas a tener que elegirla a mano.');
    }

    let categoriaNombre: string | null = null;
    let faltantes: Array<{ id: string; nombre: string }> = [];
    if (categoriaId) {
        try {
            const categoria = await llamarApi<{ name?: string }>(cuentaId, `/categories/${categoriaId}`);
            categoriaNombre = categoria.name ?? null;
        } catch {
            // El nombre es cosmético: si no viene, se muestra el id.
        }
        try {
            const atributos = await atributosDeCategoria(cuentaId, categoriaId);
            faltantes = atributosFaltantes(valoresDeAtributos(vehiculo), atributos);
            if (faltantes.length > 0) {
                advertencias.push(
                    `Mercado Libre pide estos datos obligatorios que el vehículo no tiene cargados: ${faltantes.map((a) => a.nombre).join(', ')}.`,
                );
            }
        } catch (err) {
            advertencias.push(`No se pudieron consultar los atributos obligatorios de la categoría: ${mensajeCorto(err)}`);
        }
    }

    const tipos = await tiposDePublicacion(cuentaId, cuenta.siteId, precio, categoriaId, moneda, advertencias);

    return {
        vehiculoId: vehiculo.id,
        titulo,
        categoriaId,
        categoriaNombre,
        precio,
        moneda,
        fotos: fotos.length,
        atributosFaltantes: faltantes,
        advertencias,
        tipos,
    };
}

async function tiposDePublicacion(
    cuentaId: number,
    siteId: string,
    precio: number | null,
    categoriaId: string | null,
    monedaVehiculo: string,
    advertencias: string[],
): Promise<TipoDePublicacion[]> {
    try {
        const precios = await llamarApi<PrecioDePublicacion[]>(cuentaId, `/sites/${siteId}/listing_prices`, {
            // Sin precio ML no puede calcular la comisión, pero igual devuelve la
            // grilla de tipos: se manda undefined y `llamarApi` lo omite.
            query: { price: precio ?? undefined, category_id: categoriaId ?? undefined },
        });
        const tipos = (Array.isArray(precios) ? precios : [])
            .filter((p): p is PrecioDePublicacion & { listing_type_id: string } => !!p.listing_type_id)
            .map((p) => ({
                listingTypeId: p.listing_type_id,
                nombre: p.listing_type_name ?? p.listing_type_id,
                costoPublicacion: typeof p.listing_fee_amount === 'number' ? p.listing_fee_amount : null,
                comisionVenta: typeof p.sale_fee_amount === 'number' ? p.sale_fee_amount : null,
                moneda: p.currency_id ?? monedaVehiculo,
            }));
        if (tipos.length > 0) return tipos;
        advertencias.push('Mercado Libre no devolvió tipos de publicación para esta categoría: se ofrecen los tipos básicos y NO sabemos cuánto cobra por cada uno.');
    } catch (err) {
        // "sin costo" sería mentir: el costo es DESCONOCIDO, no cero, y el
        // usuario está por apretar un botón que le cobra plata.
        advertencias.push(`No se pudieron consultar los costos de publicación en Mercado Libre: ${mensajeCorto(err)}. Se muestran los tipos básicos, pero el costo lo vas a ver recién en Mercado Libre.`);
    }
    return TIPOS_DE_RESPALDO.map((t) => ({ ...t, costoPublicacion: null, comisionVenta: null, moneda: monedaVehiculo }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Publicar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Publica el vehículo. El orden importa:
 *
 *  1. Se guarda PRIMERO la fila en 'borrador'. Si ML rechaza, queda rastro en la
 *     base con el motivo exacto (`ultimoError`) en vez de perderse en un log;
 *     es lo que hace reintentable el primer intento real contra ML.
 *  2. Recién después se llama a ML y, con la respuesta, se completa la fila.
 *
 * Si ML rechaza, la fila queda en 'error' y la excepción SE RE-LANZA: el
 * controller la devuelve tal cual al usuario. Es deliberado — el mensaje de ML
 * trae en su `cause[]` qué atributo falta, y esa es la única forma de saberlo
 * sin poder probar contra la API real de antemano.
 */
export async function publicarVehiculo(p: {
    cuentaId: number;
    vehiculoId: number;
    listingTypeId: string;
    titulo?: string;
    categoriaId?: string;
}): Promise<PublicacionMl> {
    const cuenta = await buscarCuenta(p.cuentaId);
    const vehiculo = await buscarVehiculo(p.vehiculoId);

    // La cuenta y el vehículo se resuelven por separado: si no son del mismo
    // tenant, el aviso saldría con el token (y a costa) de OTRA concesionaria, y
    // la fila quedaría con un cuentaId que su dueño no puede ni leer — imposible
    // de pausar o cerrar después desde el panel. Sólo un super_admin puede
    // llegar acá con ese cruce, pero el daño lo paga un tenant.
    if (cuenta.concesionariaId !== vehiculo.concesionariaId) {
        throw new BaseException(
            400,
            'La cuenta de Mercado Libre pertenece a otra concesionaria que el vehículo.',
            'CROSS_TENANT',
        );
    }

    const precio = aNumero(vehiculo.precioLista);
    if (precio == null || precio <= 0) {
        throw new BaseException(
            400,
            'El vehículo no tiene precio de lista: Mercado Libre no acepta una publicación sin precio.',
            'PUBLICACION_ML_SIN_PRECIO',
        );
    }

    // Publicar un auto ya vendido o reservado deja un aviso vivo (y pago) de una
    // unidad que no está en stock, y ningún camino automático lo cierra después:
    // la sincronización sólo reacciona a CAMBIOS de estado del vehículo.
    if (ESTADOS_NO_PUBLICABLES.includes(vehiculo.estado)) {
        throw new BaseException(
            409,
            `El vehículo está en estado "${vehiculo.estado}": no se puede publicar en Mercado Libre una unidad que no está disponible.`,
            'PUBLICACION_ML_ESTADO_INVALIDO',
        );
    }

    // La categoría se resuelve ANTES del candado de abajo: es una llamada a la
    // API de ML y no se puede tener una transacción abierta esperándola.
    const titulo = colapsarEspacios(p.titulo ?? tituloSugerido(vehiculo)).slice(0, LARGO_TITULO).trim();
    const categoriaId = p.categoriaId
        ?? await sugerirCategoria(p.cuentaId, juntar([vehiculo.marca, vehiculo.modelo, vehiculo.anio], ' '), cuenta.siteId);
    if (!categoriaId) {
        throw new BaseException(
            400,
            'No se pudo determinar la categoría de Mercado Libre para este vehículo: elegila a mano y volvé a intentar.',
            'PUBLICACION_ML_SIN_CATEGORIA',
        );
    }

    // Buscar-y-reservar la fila va en UNA transacción con un candado por
    // vehículo: entre el chequeo de duplicado y el POST /items no había nada que
    // impidiera que dos "Publicar" del mismo auto (doble clic, dos pestañas)
    // pasaran los dos y crearan DOS avisos en Mercado Libre, cada uno con su
    // cargo de publicación y uno de ellos sin fila que lo represente — invisible
    // para el panel y para la sincronización, así que nadie lo cierra nunca.
    const publicacion = await withTenantTransaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CANDADO_PUBLICACION_ML}::int, ${vehiculo.id}::int)`;

        // El tx NO pasa por la extensión: tenant y soft-delete van a mano.
        const existente = await tx.publicacionMl.findFirst({
            where: {
                vehiculoId: vehiculo.id,
                concesionariaId: vehiculo.concesionariaId,
                deletedAt: null,
                estado: { in: ESTADOS_VIVOS },
            },
            orderBy: { id: 'desc' },
        });

        // Con itemId, el aviso EXISTE en ML: publicar de nuevo duplicaría el
        // vehículo en el sitio.
        if (existente?.itemId) {
            throw new BaseException(
                409,
                `El vehículo ya está publicado en Mercado Libre (item ${existente.itemId}). Cerrá esa publicación antes de crear otra.`,
                'PUBLICACION_ML_DUPLICADA',
            );
        }
        // Un borrador fresco es un intento EN CURSO: reusar la fila haría que las
        // dos llamadas terminen igual en dos POST /items.
        if (existente?.estado === 'borrador' && Date.now() - existente.updatedAt.getTime() < VENTANA_PUBLICACION_EN_CURSO_MS) {
            throw new BaseException(
                409,
                'Ya hay una publicación de este vehículo en curso en Mercado Libre. Esperá a que termine antes de volver a intentar.',
                'PUBLICACION_ML_EN_CURSO',
            );
        }

        // Sin itemId es un intento que nunca llegó (borrador viejo o error): se
        // reusa la fila para que el usuario pueda corregir y reintentar en vez
        // de quedar trabado contra un 409 para siempre.
        return existente
            ? tx.publicacionMl.update({
                where: { id: existente.id },
                data: { cuentaId: p.cuentaId, listingTypeId: p.listingTypeId, categoriaId, titulo, estado: 'borrador', ultimoError: null },
            })
            : tx.publicacionMl.create({
                data: {
                    // Explícito y no delegado a la extensión: el tx crudo no
                    // inyecta tenant (y para un super_admin tampoco lo haría).
                    concesionariaId: vehiculo.concesionariaId,
                    cuentaId: p.cuentaId,
                    vehiculoId: vehiculo.id,
                    listingTypeId: p.listingTypeId,
                    categoriaId,
                    titulo,
                    estado: 'borrador',
                },
            });
    });

    try {
        const atributosCategoria = await atributosDeCategoria(p.cuentaId, categoriaId).catch(() => [] as AtributoCategoria[]);
        const moneda = vehiculo.moneda || 'ARS';
        const fotos = appUrlEsLocal() ? [] : fotosDelVehiculo(vehiculo);

        const item = await llamarApi<ItemMl>(p.cuentaId, '/items', {
            method: 'POST',
            body: {
                title: titulo,
                category_id: categoriaId,
                price: precio,
                currency_id: moneda,
                available_quantity: 1,
                buying_mode: 'classified',
                condition: vehiculo.tipo === 'CERO_KM' ? 'new' : 'used',
                listing_type_id: p.listingTypeId,
                description: { plain_text: descripcionDelVehiculo(vehiculo) },
                // Sin fotos alcanzables no se manda el array: ML rechaza una
                // `source` que no puede descargar y el aviso se pierde entero.
                ...(fotos.length > 0
                    ? { pictures: fotos.map((f) => ({ source: `${baseUrlPublica()}${f.url}` })) }
                    : {}),
                attributes: atributosParaMl(valoresDeAtributos(vehiculo), atributosCategoria),
            },
        });

        return await prisma.publicacionMl.update({
            where: { id: publicacion.id },
            data: {
                itemId: item.id ?? null,
                permalink: item.permalink ?? null,
                estado: estadoDesdeMl(item.status) ?? 'activa',
                precioPublicado: typeof item.price === 'number' ? item.price : precio,
                monedaPublicada: item.currency_id ?? moneda,
                ultimoError: null,
                ultimaSyncAt: new Date(),
            },
        });
    } catch (err) {
        await prisma.publicacionMl
            .update({ where: { id: publicacion.id }, data: { estado: 'error', ultimoError: mensajeCorto(err) } })
            .catch(() => undefined);
        logger.error(`[meli-publicacion] vehículo ${vehiculo.id}: ML rechazó la publicación: ${mensajeCorto(err)}`);
        throw err;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado de una publicación
// ─────────────────────────────────────────────────────────────────────────────

/** Espeja en la base lo que ML dice hoy del item (fuente de verdad: ML). */
export async function sincronizarPublicacion(publicacionId: number): Promise<PublicacionMl> {
    const publicacion = await buscarPublicacion(publicacionId);
    const itemId = exigirItemId(publicacion);

    try {
        const item = await llamarApi<ItemMl>(publicacion.cuentaId, `/items/${itemId}`);
        return await prisma.publicacionMl.update({
            where: { id: publicacion.id },
            data: {
                estado: estadoDesdeMl(item.status) ?? publicacion.estado,
                permalink: item.permalink ?? publicacion.permalink,
                precioPublicado: typeof item.price === 'number' ? item.price : publicacion.precioPublicado,
                monedaPublicada: item.currency_id ?? publicacion.monedaPublicada,
                ultimoError: null,
                ultimaSyncAt: new Date(),
            },
        });
    } catch (err) {
        // 404 = el item ya no existe en ML (lo borraron desde allá): no es una
        // falla de sincronización, es la respuesta.
        if (err instanceof MeliError && err.status === 404) {
            return prisma.publicacionMl.update({
                where: { id: publicacion.id },
                data: { estado: 'cerrada', ultimoError: null, ultimaSyncAt: new Date() },
            });
        }
        await registrarUltimoError(publicacion.id, err);
        throw err;
    }
}

async function cambiarEstadoEnMl(
    publicacionId: number,
    status: 'paused' | 'active' | 'closed',
    estadoLocal: EstadoPublicacionMl,
): Promise<PublicacionMl> {
    const publicacion = await buscarPublicacion(publicacionId);

    if (publicacion.estado === 'cerrada') {
        // Cerrar algo ya cerrado es un no-op, no un error.
        if (status === 'closed') return publicacion;
        throw new BaseException(
            409,
            'La publicación está cerrada en Mercado Libre: un item cerrado no se puede reactivar. Hay que publicar el vehículo de nuevo.',
            'PUBLICACION_ML_CERRADA',
        );
    }

    const itemId = exigirItemId(publicacion);
    try {
        const item = await llamarApi<ItemMl>(publicacion.cuentaId, `/items/${itemId}`, { method: 'PUT', body: { status } });
        return await prisma.publicacionMl.update({
            where: { id: publicacion.id },
            data: {
                estado: estadoDesdeMl(item.status) ?? estadoLocal,
                permalink: item.permalink ?? publicacion.permalink,
                ultimoError: null,
                ultimaSyncAt: new Date(),
            },
        });
    } catch (err) {
        // El estado local NO se toca: el item en ML sigue como estaba.
        await registrarUltimoError(publicacion.id, err);
        throw err;
    }
}

export const pausarPublicacion = (publicacionId: number): Promise<PublicacionMl> =>
    cambiarEstadoEnMl(publicacionId, 'paused', 'pausada');

export const reactivarPublicacion = (publicacionId: number): Promise<PublicacionMl> =>
    cambiarEstadoEnMl(publicacionId, 'active', 'activa');

export const cerrarPublicacion = (publicacionId: number): Promise<PublicacionMl> =>
    cambiarEstadoEnMl(publicacionId, 'closed', 'cerrada');

// ─────────────────────────────────────────────────────────────────────────────
// Sincronización automática (efecto lateral del stock)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refleja en Mercado Libre lo que pasó con el vehículo: precio nuevo, reservado
 * (pausa), vendido (cierra), vuelto a publicar (reactiva).
 *
 * NUNCA tira. Cuelga del guardado de un vehículo, que ya commiteó cuando esto
 * corre: si ML está caído o rechaza el cambio, se registra en `ultimoError` y en
 * el log, pero la edición del stock no puede fallar por eso. El worker de
 * sincronización vuelve a pasar más tarde.
 */
export async function sincronizarPorVehiculo(vehiculoId: number): Promise<void> {
    let publicacionId: number | null = null;
    try {
        const publicacion = await prisma.publicacionMl.findFirst({
            where: { vehiculoId, estado: { in: ESTADOS_VIVOS }, itemId: { not: null } },
            orderBy: { id: 'desc' },
        });
        if (!publicacion?.itemId) return;
        publicacionId = publicacion.id;

        const vehiculo = await prisma.vehiculo.findFirst({
            where: { id: vehiculoId },
            select: { estado: true, precioLista: true, moneda: true },
        });
        if (!vehiculo) return;

        const precio = aNumero(vehiculo.precioLista);
        const moneda = vehiculo.moneda || 'ARS';
        const precioPublicado = aNumero(publicacion.precioPublicado);

        // ML no deja cambiar la moneda de un item ya publicado: se avisa en vez
        // de mandar un PUT que va a rebotar sí o sí.
        if (publicacion.monedaPublicada && publicacion.monedaPublicada !== moneda) {
            await registrarUltimoError(
                publicacion.id,
                new Error(`El vehículo cambió de moneda (${publicacion.monedaPublicada} → ${moneda}) y Mercado Libre no permite cambiarla en un aviso publicado: hay que cerrarlo y publicarlo de nuevo.`),
            );
        } else if (precio != null && precio > 0 && precio !== precioPublicado) {
            const item = await llamarApi<ItemMl>(publicacion.cuentaId, `/items/${publicacion.itemId}`, {
                method: 'PUT',
                body: { price: precio },
            });
            await prisma.publicacionMl.update({
                where: { id: publicacion.id },
                data: {
                    precioPublicado: typeof item.price === 'number' ? item.price : precio,
                    monedaPublicada: item.currency_id ?? publicacion.monedaPublicada ?? moneda,
                    ultimoError: null,
                    ultimaSyncAt: new Date(),
                },
            });
            logger.info(`[meli-publicacion] vehículo ${vehiculoId}: precio sincronizado (${precioPublicado ?? '—'} → ${precio})`);
        }

        if (vehiculo.estado === 'reservado' && publicacion.estado === 'activa') {
            await pausarPublicacion(publicacion.id);
        } else if (vehiculo.estado === 'vendido') {
            await cerrarPublicacion(publicacion.id);
        } else if (vehiculo.estado === 'publicado' && publicacion.estado === 'pausada') {
            await reactivarPublicacion(publicacion.id);
        }
    } catch (err) {
        logger.error(`[meli-publicacion] vehículo ${vehiculoId}: no se pudo sincronizar con Mercado Libre: ${mensajeCorto(err)}`);
        if (publicacionId != null) await registrarUltimoError(publicacionId, err);
    }
}

/**
 * Efecto lateral de una transición de estado del vehículo, para llamar DESPUÉS
 * del commit del caso de uso que la produjo.
 *
 * Existe para que no haya que acordarse del `void ... .catch()` en cada lugar
 * que mueve un vehículo: el vehículo pasa a vendido/reservado/publicado desde
 * seis use-cases distintos (venta, reserva y sus bajas), y durante un tiempo el
 * único que sincronizaba era la edición manual de la ficha — o sea que el camino
 * REAL de venta dejaba el aviso vivo en Mercado Libre.
 *
 * No se espera el resultado: es una llamada de red de varios segundos contra la
 * API de ML y ni su demora ni su fallo pueden afectar la respuesta de una
 * operación que YA commiteó. `sincronizarPorVehiculo` no tira (loguea y deja el
 * motivo en `ultimoError`); el `.catch` es defensa en profundidad para que una
 * rejection suelta no tumbe el proceso por el handler de unhandledRejection.
 */
export function sincronizarEnSegundoPlano(vehiculoId: number): void {
    void sincronizarPorVehiculo(vehiculoId).catch(() => undefined);
}

/**
 * Reconciliación COMPLETA de una publicación: espejo + empuje.
 *
 * `sincronizarPublicacion` sola es un espejo de una sola dirección (ML → base):
 * nunca vuelve a empujar el precio ni el estado del vehículo, y además limpia el
 * `ultimoError`. Usada sola como "reparación" hacía lo contrario de lo que
 * promete: un empuje fallido (precio nuevo que ML rechazó, cierre de un auto
 * vendido que rebotó) quedaba borrado y el aviso vivía desincronizado para
 * siempre, con la ficha diciendo "sincronizado hace un momento".
 *
 * El orden importa: primero el espejo, para partir del estado REAL del aviso, y
 * después el empuje — al revés, el espejo borraría el `ultimoError` que el
 * empuje acaba de dejar.
 */
export async function reconciliarPublicacion(publicacionId: number): Promise<PublicacionMl> {
    const publicacion = await buscarPublicacion(publicacionId);
    await sincronizarPublicacion(publicacionId);
    await sincronizarPorVehiculo(publicacion.vehiculoId);
    // Se relee: el empuje pudo cambiar precio, estado o ultimoError.
    return buscarPublicacion(publicacionId);
}

/**
 * Cuenta vinculada y activa de la concesionaria (hoy se soporta una sola).
 *
 * El `concesionariaId` va EXPLÍCITO y es obligatorio: para un super_admin la
 * extensión no inyecta tenant y la RLS tampoco filtra, así que sin él esto
 * devolvía la primera cuenta activa de TODA la plataforma. El orden es `desc`,
 * el mismo que usa el controller para mostrar la cuenta en Configuración: si
 * divergen, la pantalla muestra una cuenta y el sistema publica con otra.
 */
export const cuentaActivaDelTenant = (concesionariaId: number): Promise<MercadoLibreCuenta | null> =>
    prisma.mercadoLibreCuenta.findFirst({
        where: { concesionariaId, activa: true },
        orderBy: { id: 'desc' },
    });
