import type {
    CanalConversacion,
    DireccionMensaje,
    EstadoMensajeWhatsapp,
    IntegracionCanal,
    TipoMensajeWhatsapp,
} from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { withTenantTransaction } from '../../infrastructure/database/unitOfWork';
import { BaseException } from '../../domain/exceptions/BaseException';
import { VENTANA_MENSAJERIA_MS, esCanalDeComentarios, esCanalDeMensajeria } from '../../domain/services/canalesMeta';
import { logger } from '../../infrastructure/logging/logger';

/**
 * MODO DEMOSTRACIÓN de los canales de Meta (DM de Instagram, Messenger y
 * comentarios de Instagram y Facebook).
 *
 * POR QUÉ EXISTE: los cuatro canales dependen del App Review de Meta, que tarda
 * semanas. El sistema se le muestra a un comprador ANTES de eso, y una bandeja
 * vacía no demuestra nada. Mismo criterio que ya usan el modo demostración de
 * Mercado Libre y el CAE simulado de AFIP.
 *
 * REGLA DE INTEGRIDAD: nada de lo que crea este módulo puede confundirse con un
 * dato real. Los identificadores llevan prefijo `DEMO-` para que se distingan a
 * simple vista de un IGSID/PSID de Meta (que son numéricos larguísimos), los
 * nombres de contacto llevan `(DEMO)` y ninguna fila apunta a un post ni a un
 * comentario que exista fuera del sistema. La pantalla, además, rotula cada hilo
 * simulado con el chip SIMULACIÓN.
 *
 * QUÉ NO HACE: ni una llamada de red. Las conversaciones se escriben derecho en
 * la base con la MISMA forma que les daría la ingesta real del webhook (ver
 * `metaCanales.obtenerOCrearHilo` y `metaNormalizacion.claveHiloDe`), así que
 * responder, asignar, cerrar y convertir en lead recorren el código de verdad.
 * El desvío que evita la salida a la Graph API vive en `metaEnvio`, en el único
 * embudo por el que sale todo, no acá.
 */

/** Nombre visible de la integración simulada: el nombre ya dice qué es. */
export const NOMBRE_INTEGRACION_DEMO = 'Instagram y Facebook (demostración)';

/**
 * Config de la integración simulada: MÍNIMA y SIN un solo secreto.
 *
 * Una integración demo nunca sale a la red (el desvío de `metaEnvio` la corta
 * antes de resolver credenciales) y sus canales los habilita el `modo`, no lo
 * que haya cargado acá. Por eso no guarda ni verifyToken, ni appSecret, ni
 * tokens de página: no hay ningún secreto real que proteger, y el alta demo
 * tampoco exige INTEGRACIONES_SECRET_KEY —a diferencia del alta normal, que
 * cifra el config en reposo—. Un token de fantasía sería exactamente el dato
 * falso que este módulo no puede producir.
 *
 * `origen` sí va: es el único campo que no es una credencial y lo usa el mapeo
 * de leads. Los hilos simulados cubren Instagram y Facebook por igual; el origen
 * fino de cada lead sale del canal del hilo, no de acá.
 */
const CONFIG_DEMO: Record<string, unknown> = { origen: 'instagram' };

// Anotados una sola vez para que el `map` del createMany no infiera `string` y
// Prisma rechace el enum (un `as const` sobre un ternario no es TS válido).
const TIPO_TEXTO: TipoMensajeWhatsapp = 'texto';
const ESTADO_RECIBIDO: EstadoMensajeWhatsapp = 'recibido';
const ESTADO_ENVIADO: EstadoMensajeWhatsapp = 'enviado';

// ─────────────────────────────────────────────────────────────────────────────
// Las conversaciones de ejemplo
// ─────────────────────────────────────────────────────────────────────────────

interface MensajeDemo {
    direccion: DireccionMensaje;
    /**
     * Id del mensaje (el `mid` de la Send API) o del comentario. Es la clave de
     * IDEMPOTENCIA: va en el unique [conversacionId, externoId], así que apretar
     * "Generar" dos veces no puede duplicar una burbuja.
     */
    externoId: string;
    /** Minutos hacia atrás desde el instante de la siembra. */
    haceMinutos: number;
    texto: string;
}

interface HiloDemo {
    canal: CanalConversacion;
    /** IGSID / PSID del contacto. Opaco, con prefijo DEMO-. */
    contactoExternoId: string;
    /** Sólo comentarios: post y comentario RAÍZ del hilo. */
    postExternoId: string | null;
    comentarioExternoId: string | null;
    nombreContacto: string;
    mensajes: MensajeDemo[];
}

/**
 * Los cinco hilos de la demostración, sobre los CUATRO canales de Meta.
 *
 * Los textos son los que de verdad escribe alguien que busca un auto usado en
 * Argentina (si sigue disponible, permuta, financiación, kilometraje, precio de
 * contado): la demostración se le muestra a otra persona y con "mensaje de
 * prueba 1" no se entiende para qué sirve la bandeja.
 *
 * El reparto de tiempos NO es decorativo, es la mitad de lo que hay que mostrar:
 *  - Ariel (Instagram): recién escribió → ventana de 24 h ABIERTA, se contesta.
 *  - Vanina (Messenger): escribió hace casi 23 h → la ventana está por cerrarse
 *    y la bandeja avisa cuánto queda. Es el caso que explica la regla.
 *  - Gustavo (Instagram): último mensaje hace 31 h → ventana CERRADA. El
 *    composer queda bloqueado y dice por qué; sin este hilo la demostración
 *    cuenta media verdad. Lleva una respuesta del vendedor en el medio para que
 *    se vea que el hilo se atendió y aun así el plazo venció.
 *  - Belén (comentario de Instagram) y Rubén (comentario de Facebook): la
 *    respuesta es PÚBLICA, y la bandeja lo avisa antes de escribir.
 */
const HILOS_DEMO: HiloDemo[] = [
    {
        canal: 'instagram',
        contactoExternoId: 'DEMO-IGSID-ARIEL',
        postExternoId: null,
        comentarioExternoId: null,
        nombreContacto: 'Ariel Sosa (DEMO)',
        mensajes: [
            {
                direccion: 'entrante',
                externoId: 'DEMO-MID-ARIEL-1',
                haceMinutos: 22,
                texto: '¡Hola! Buenas. Vi la Hilux 2019 SRV 4x4 que tienen publicada, ¿todavía está disponible?',
            },
            {
                direccion: 'entrante',
                externoId: 'DEMO-MID-ARIEL-2',
                haceMinutos: 14,
                texto: 'Otra consulta: ¿el kilometraje es el real y tiene los service hechos en el oficial? Si sigue, mañana a la mañana me doy una vuelta a verla.',
            },
        ],
    },
    {
        canal: 'messenger',
        contactoExternoId: 'DEMO-PSID-VANINA',
        postExternoId: null,
        comentarioExternoId: null,
        nombreContacto: 'Vanina Ledesma (DEMO)',
        mensajes: [
            {
                direccion: 'entrante',
                externoId: 'DEMO-MID-VANINA-1',
                haceMinutos: 22 * 60 + 55,
                texto: 'Buenas tardes. ¿Hacen financiación por el Cronos 1.3 que publicaron? Quería saber cuánto piden de anticipo.',
            },
            {
                direccion: 'entrante',
                externoId: 'DEMO-MID-VANINA-2',
                haceMinutos: 22 * 60 + 40,
                texto: 'Trabajo en blanco y tengo recibo de sueldo. ¿En cuántas cuotas se puede sacar y con qué tasa queda?',
            },
        ],
    },
    {
        canal: 'instagram',
        contactoExternoId: 'DEMO-IGSID-GUSTAVO',
        postExternoId: null,
        comentarioExternoId: null,
        nombreContacto: 'Gustavo Peralta (DEMO)',
        mensajes: [
            {
                direccion: 'entrante',
                externoId: 'DEMO-MID-GUSTAVO-1',
                haceMinutos: 33 * 60,
                texto: 'Hola, buenas. ¿Toman permuta? Tengo un Ford Ka 2015 nafta, 118.000 km, papeles al día y la VTV hecha.',
            },
            {
                direccion: 'saliente',
                externoId: 'DEMO-MID-GUSTAVO-2',
                haceMinutos: 32 * 60,
                texto: 'Hola Gustavo, sí, tomamos usados en parte de pago. Pasanos fotos y la versión exacta así te lo cotizamos.',
            },
            {
                direccion: 'entrante',
                externoId: 'DEMO-MID-GUSTAVO-3',
                haceMinutos: 31 * 60,
                texto: 'Ahí te mando las fotos. ¿Cuánto me estarían tomando y cuánto tendría que poner encima por la EcoSport?',
            },
        ],
    },
    {
        canal: 'instagram_comentario',
        contactoExternoId: 'DEMO-IGSID-BELEN',
        postExternoId: 'DEMO-POST-IG-1',
        // El comentario RAÍZ es también el externoId del primer mensaje: así lo
        // arma la ingesta real (metaNormalizacion.claveHiloDe).
        comentarioExternoId: 'DEMO-COMMENT-IG-1',
        nombreContacto: 'Belén Ocampo (DEMO)',
        mensajes: [
            {
                direccion: 'entrante',
                externoId: 'DEMO-COMMENT-IG-1',
                haceMinutos: 52,
                texto: '¡Qué linda quedó! ¿Sigue disponible?',
            },
            {
                direccion: 'entrante',
                externoId: 'DEMO-COMMENT-IG-2',
                haceMinutos: 48,
                texto: '¿El precio lo pasan por acá o por privado?',
            },
        ],
    },
    {
        canal: 'facebook_comentario',
        contactoExternoId: 'DEMO-PSID-RUBEN',
        postExternoId: 'DEMO-POST-FB-1',
        comentarioExternoId: 'DEMO-COMMENT-FB-1',
        nombreContacto: 'Rubén Ceballos (DEMO)',
        mensajes: [
            {
                direccion: 'entrante',
                externoId: 'DEMO-COMMENT-FB-1',
                haceMinutos: 2 * 60 + 10,
                texto: 'Buenas. ¿El precio publicado es de contado? ¿Y aceptan permuta por una Partner 2017 diésel?',
            },
        ],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Si una integración es la simulada. Se mira el `modo` y no el nombre ni el
 * config: el modo es el que decide si se sale a la red, así que es la única
 * fuente de verdad para rotular la pantalla.
 *
 * El parámetro es estructural y `modo` opcional a propósito: le sirve tanto la
 * fila completa de Prisma como un select acotado.
 */
export const esIntegracionDemo = (integracion?: { modo?: string | null } | null): boolean =>
    integracion?.modo === 'demo';

/**
 * La integración simulada del tenant, si está.
 *
 * El `where` lleva concesionariaId EXPLÍCITO porque para un super_admin la
 * extensión no inyecta tenant: sin esto vería la demo de otra concesionaria.
 */
export const buscarIntegracionDemo = (concesionariaId: number): Promise<IntegracionCanal | null> =>
    prisma.integracionCanal.findFirst({
        where: { concesionariaId, tipo: 'meta', modo: 'demo' },
        orderBy: { id: 'desc' },
    });

/**
 * Corta el alta (o el re-encendido) de una integración de Meta REAL mientras la
 * demostración está puesta.
 *
 * Es el corte SIMÉTRICO al 409 de `activarDemoMeta`, y por el mismo motivo: con
 * las dos vivas, la bandeja mezcla en una sola lista ordenada por fecha los
 * hilos de compradores de verdad con los cinco fabricados, y Ajustes rotula toda
 * la sección como SIMULACIÓN mientras afirma —en presente— que "no se llama a
 * Meta", que es falso para la real que está ingiriendo y respondiendo. Sin este
 * corte la invariante sólo se cumplía si el orden de las altas era el esperado.
 * Mismo patrón que `MercadoLibreController.vincular`.
 */
export async function assertSinDemoMetaActiva(concesionariaId: number): Promise<void> {
    const demo = await buscarIntegracionDemo(concesionariaId);
    if (!demo?.activo) return;
    throw new BaseException(
        409,
        'Esta concesionaria está en modo demostración de Instagram y Facebook. '
        + 'Salí del modo demostración desde Ajustes › Integraciones (eso borra las conversaciones simuladas) '
        + 'y después conectá la integración real: si quedaran las dos, la bandeja mezclaría los mensajes de '
        + 'gente de verdad con los de la demostración.',
        'META_DEMO_ACTIVA',
    );
}

/** Clave natural del hilo, con el MISMO formato que arma la ingesta real. */
const claveHiloDemo = (integracionId: number, hilo: HiloDemo): string =>
    `${integracionId}:${esCanalDeComentarios(hilo.canal) ? hilo.comentarioExternoId : hilo.contactoExternoId}`;

/** Instante de un mensaje de la plantilla, contado hacia atrás desde `sello`. */
const instante = (sello: number, haceMinutos: number): Date => new Date(sello - haceMinutos * 60_000);

/**
 * El "reloj" del hilo: los tres campos que la bandeja usa para ordenar, para
 * decidir si el composer se abre y para que la lista se vea viva.
 *
 * `ventanaVenceAt` se calcula desde el último mensaje ENTRANTE (la ventana de
 * Meta se corre con cada mensaje del usuario, no con nuestras respuestas) y sólo
 * para los canales de mensajería: en un comentario no hay plazo que respetar.
 *
 * `noLeidos` son los entrantes posteriores a la última respuesta nuestra, que es
 * lo que de verdad tiene pendiente el vendedor.
 */
function relojDelHilo(hilo: HiloDemo, sello: number) {
    const ultimo = hilo.mensajes[hilo.mensajes.length - 1];
    const ultimoEntrante = [...hilo.mensajes].reverse().find((m) => m.direccion === 'entrante') ?? ultimo;
    const indiceUltimaRespuesta = hilo.mensajes.map((m) => m.direccion).lastIndexOf('saliente');
    const noLeidos = hilo.mensajes
        .slice(indiceUltimaRespuesta + 1)
        .filter((m) => m.direccion === 'entrante').length;

    return {
        ultimoMensajeAt: instante(sello, ultimo.haceMinutos),
        ultimoMensajeDir: ultimo.direccion,
        noLeidos,
        ventanaVenceAt: esCanalDeMensajeria(hilo.canal)
            ? new Date(instante(sello, ultimoEntrante.haceMinutos).getTime() + VENTANA_MENSAJERIA_MS)
            : null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Alta, siembra y baja
// ─────────────────────────────────────────────────────────────────────────────

export interface AltaDemo {
    integracion: IntegracionCanal;
    /** false si la demostración ya estaba activa (el alta es idempotente). */
    creada: boolean;
}

/**
 * Enciende el modo demostración de Meta en el tenant.
 *
 * Crea una integración que NO existe en Meta: no tiene tokens, no recibe
 * webhooks y no puede salir a la red. Sirve para recorrer el circuito completo
 * (bandeja, ventana de 24 h, respuesta pública de un comentario, lead) sin App
 * Review y sin escribirle a nadie de verdad.
 */
export async function activarDemoMeta(concesionariaId: number): Promise<AltaDemo> {
    // Lo REAL y lo simulado no conviven: con las dos encendidas, la bandeja
    // mezclaría hilos de compradores de verdad con hilos fabricados y el que
    // mira la demostración no tendría cómo saber cuál es cuál sin abrirlos uno
    // por uno. El corte mira `activo` porque una integración real apagada ya no
    // ingiere nada nuevo, y los hilos que dejó siguen distinguiéndose: el chip
    // SIMULACIÓN se resuelve hilo por hilo (por su integración), no de golpe
    // para toda la pantalla.
    const real = await prisma.integracionCanal.findFirst({
        where: { concesionariaId, tipo: 'meta', modo: 'real', activo: true },
        select: { id: true, nombre: true },
    });
    if (real) {
        throw new BaseException(
            409,
            `Esta concesionaria ya tiene conectada la integración real de Meta ("${real.nombre}"). `
            + 'Desactivala primero desde Ajustes › Integraciones: si quedaran las dos, en la bandeja se mezclarían '
            + 'las conversaciones de gente de verdad con las de la demostración.',
            'META_INTEGRACION_REAL_ACTIVA',
        );
    }

    const yaEstaba = await buscarIntegracionDemo(concesionariaId);
    if (yaEstaba) {
        // Idempotente: volver a apretar el botón deja la demostración como
        // estaba, en vez de crear una segunda integración simulada delante de
        // quien mira. La reactivación es DEFENSIVA: hoy la integración demo no
        // se puede apagar (el PATCH del CRUD la rechaza y la pantalla ni ofrece
        // el interruptor), pero si alguna vez quedara en `activo: false` este
        // camino la endereza en vez de dejar la demostración muda.
        const integracion = yaEstaba.activo
            ? yaEstaba
            : await prisma.integracionCanal.update({
                where: { id: yaEstaba.id },
                data: { activo: true, ultimoError: null },
            });
        return { integracion, creada: false };
    }

    const integracion = await prisma.integracionCanal.create({
        data: {
            concesionariaId,
            tipo: 'meta',
            modo: 'demo',
            nombre: NOMBRE_INTEGRACION_DEMO,
            activo: true,
            // Sin cifrar: no hay ningún secreto adentro (ver CONFIG_DEMO).
            config: CONFIG_DEMO,
        },
    });
    return { integracion, creada: true };
}

export interface SiembraDemo {
    /** Conversaciones nuevas. */
    creadas: number;
    /** Las que ya estaban sembradas: no se duplican, se les reinicia el reloj. */
    yaExistian: number;
    /** Burbujas nuevas (las que ya estaban se saltean por su externoId). */
    mensajesCreados: number;
    /**
     * Respuestas de la demostración anterior que se descartaron al reiniciar los
     * hilos. Se informa para que el aviso de la pantalla diga lo que de verdad
     * pasó: el botón no "agrega" mensajes, deja los hilos como recién llegados.
     */
    respuestasDescartadas: number;
}

/**
 * Siembra las conversaciones de ejemplo de la demostración.
 *
 * IDEMPOTENTE por construcción: la `claveHilo` de cada hilo es determinista
 * (integración + id DEMO- del contacto o del comentario) y choca contra el
 * unique [concesionariaId, canal, claveHilo]; cada mensaje lleva un `externoId`
 * fijo que choca contra el unique [conversacionId, externoId]. Apretar dos veces
 * "Generar" no puede duplicar ni un hilo ni una burbuja.
 *
 * Lo que SÍ hace la segunda vez es REINICIAR el hilo: los tiempos de la
 * plantilla son relativos a este instante, así que a un hilo sembrado ayer se le
 * vuelven a acomodar `ultimoMensajeAt`, la ventana de 24 h y los no leídos. Sin
 * esto, una demostración repetida al día siguiente arrancaba con los cuatro
 * hilos vencidos y el composer bloqueado en todos — justo lo contrario de lo que
 * hay que mostrar.
 *
 * Y reiniciar quiere decir reiniciar DE VERDAD: las respuestas que escribió el
 * vendedor en la demostración anterior se descartan. Conservarlas partía el hilo
 * en dos verdades — el reloj (`ultimoMensajeAt`, `ultimoMensajeDir`, `noLeidos`)
 * sale de la plantilla, pero la lista previsualiza el mensaje realmente más
 * nuevo y el panel ordena por `createdAt` —, así que la bandeja terminaba
 * mostrando la frase del propio vendedor como si la hubiera escrito el
 * comprador, con globito de "sin leer" sobre un hilo ya contestado y, al día
 * siguiente, con el concesionario contestando ANTES de que le preguntaran.
 * Delante del comprador. Es además lo que ya documenta el apagado de la
 * demostración: arrancar con las respuestas de la vez anterior arruina el relato.
 */
export async function sembrarConversacionesDemo(concesionariaId: number): Promise<SiembraDemo> {
    const integracion = await buscarIntegracionDemo(concesionariaId);
    if (!integracion || !integracion.activo) {
        throw new BaseException(
            409,
            'El modo demostración de Instagram y Facebook no está activo. '
            + 'Activalo desde Ajustes › Integraciones y después generá las conversaciones de ejemplo.',
            'META_SIN_INTEGRACION_DEMO',
        );
    }

    const sello = Date.now();
    let creadas = 0;
    let yaExistian = 0;
    let mensajesCreados = 0;
    let respuestasDescartadas = 0;

    for (const hilo of HILOS_DEMO) {
        const claveHilo = claveHiloDemo(integracion.id, hilo);
        const reloj = relojDelHilo(hilo, sello);
        const externosDePlantilla = hilo.mensajes.map((m) => m.externoId);

        // concesionariaId explícito: para un super_admin la extensión no lo
        // inyecta y el hilo caería en la concesionaria equivocada (o en ninguna).
        const existente = await prisma.conversacion.findFirst({
            where: { concesionariaId, canal: hilo.canal, claveHilo },
            select: { id: true, estado: true },
        });

        let conversacionId: number;
        if (existente) {
            yaExistian += 1;
            conversacionId = existente.id;

            // Reiniciar el hilo = dejarlo como lo dice la PLANTILLA. Todo lo que
            // no está en ella lo escribió el vendedor en la demostración
            // anterior (el saliente nace con `externoId` null y el desvío
            // simulado le pone después un `DEMO-MID-<base36>-<n>`, que la
            // plantilla no conoce), y esas burbujas NO las alcanza el `updateMany`
            // que corre el reloj: se quedaban con su `createdAt` viejo mientras
            // los entrantes se movían a hoy, y el hilo pasaba a leerse con el
            // concesionario contestando antes de que le preguntaran.
            // El delete lo reescribe la extensión como soft-delete: alcanza para
            // que desaparezcan de la bandeja (todas las lecturas filtran
            // `deletedAt`) y para que el worker no despache un pendiente de la
            // corrida anterior; el borrado físico se lo lleva `desactivarDemoMeta`.
            const descartadas = await prisma.mensajeWhatsapp.deleteMany({
                where: {
                    concesionariaId,
                    conversacionId,
                    deletedAt: null,
                    // `notIn` no matchea NULL en SQL, y un saliente todavía en la
                    // cola tiene el externoId en null: van las dos ramas.
                    OR: [{ externoId: null }, { externoId: { notIn: externosDePlantilla } }],
                },
            });
            respuestasDescartadas += descartadas.count;

            await prisma.conversacion.update({
                where: { id: existente.id },
                data: {
                    ...reloj,
                    // Si el vendedor la cerró en la demostración anterior vuelve a
                    // abrirse; un hilo ARCHIVADO a mano se respeta, igual que hace
                    // la ingesta real cuando entra un mensaje nuevo.
                    ...(existente.estado === 'archivada' ? {} : { estado: 'abierta' as const }),
                    nombreContacto: hilo.nombreContacto,
                },
            });
        } else {
            const creada = await prisma.conversacion.create({
                data: {
                    concesionariaId,
                    canal: hilo.canal,
                    claveHilo,
                    integracionId: integracion.id,
                    // Los canales de Meta no cuelgan de una cuenta de WhatsApp y
                    // no tienen teléfono: el contacto es un id opaco de Meta.
                    whatsappCuentaId: null,
                    telefono: null,
                    contactoExternoId: hilo.contactoExternoId,
                    postExternoId: hilo.postExternoId,
                    comentarioExternoId: hilo.comentarioExternoId,
                    // NUNCA null: si el hilo entrara sin nombre, la ingesta real
                    // lo saldría a buscar al Graph API — una llamada de red que
                    // el modo demostración no puede hacer.
                    nombreContacto: hilo.nombreContacto,
                    clienteId: null,
                    estado: 'abierta',
                    ...reloj,
                },
                select: { id: true },
            });
            creadas += 1;
            conversacionId = creada.id;
        }

        // createMany es la ÚNICA operación que la extensión no completa con el
        // tenant, por eso cada fila lleva su concesionariaId explícito.
        // `skipDuplicates` es lo que hace idempotente al botón: los externoId son
        // fijos, así que la segunda pasada no agrega nada.
        const nuevos = await prisma.mensajeWhatsapp.createMany({
            data: hilo.mensajes.map((mensaje) => {
                const fecha = instante(sello, mensaje.haceMinutos);
                const entrante = mensaje.direccion === 'entrante';
                return {
                    concesionariaId,
                    conversacionId,
                    direccion: mensaje.direccion,
                    // El enum TipoMensajeWhatsapp no tiene 'comentario' (en
                    // Postgres un valor de enum no se puede borrar, así que no se
                    // agregan a la ligera): un comentario entra como 'texto',
                    // igual que en la ingesta real. Qué es lo dice el canal del hilo.
                    tipo: TIPO_TEXTO,
                    contenido: mensaje.texto,
                    estado: entrante ? ESTADO_RECIBIDO : ESTADO_ENVIADO,
                    externoId: mensaje.externoId,
                    ...(entrante ? {} : { enviadoEn: fecha }),
                    createdAt: fecha,
                };
            }),
            skipDuplicates: true,
        });
        mensajesCreados += nuevos.count;

        // Las burbujas que ya estaban se recorren en el tiempo junto con el
        // hilo: si no, el reloj del hilo diría "hace 14 minutos" y la conversación
        // de arriba seguiría fechada ayer.
        if (existente) {
            for (const mensaje of hilo.mensajes) {
                await prisma.mensajeWhatsapp.updateMany({
                    where: { concesionariaId, conversacionId, externoId: mensaje.externoId },
                    data: { createdAt: instante(sello, mensaje.haceMinutos) },
                });
            }
        }
    }

    logger.info(
        `[integraciones-demo] conversaciones simuladas sembradas en la concesionaria ${concesionariaId}: `
        + `${creadas} nuevas, ${yaExistian} ya estaban, ${mensajesCreados} mensajes`
        + `${respuestasDescartadas > 0 ? `, ${respuestasDescartadas} respuestas de la corrida anterior descartadas` : ''}`,
    );
    return { creadas, yaExistian, mensajesCreados, respuestasDescartadas };
}

export interface BajaDemo {
    conversacionesEliminadas: number;
    mensajesEliminados: number;
    /** Fichas del CRM que nacieron de un hilo simulado y siguen ahí, rotuladas. */
    clientesConservados: number;
}

/**
 * Apaga el modo demostración y borra TODO lo simulado.
 *
 * Borrón y cuenta nueva, no baja lógica: la demostración se repite y arrancar
 * con los hilos y las respuestas de la vez anterior arruina el relato. Por eso
 * el borrado es FÍSICO y en UNA transacción — a mitad de camino quedarían
 * mensajes colgando de una conversación que ya no está.
 *
 * Lo que NO se borra: los clientes que se hayan registrado como lead desde un
 * hilo simulado. No es un olvido — la ingesta pudo haber matcheado un cliente
 * REAL preexistente (el vendedor cargó un teléfono ya conocido; ahí sólo le
 * anota la consulta rotulada en observaciones, ver `sobreFichaReal` en
 * consultaIngest), y un borrado en cascada se llevaría puesta esa ficha de
 * verdad. Los que sí nacieron de la demostración quedan con `origenSimulado` y
 * se CUENTAN antes de borrar: al irse las conversaciones desaparece el vínculo,
 * así que el número es lo único que le avisa al usuario que en Clientes quedó
 * algo de la demostración.
 */
export async function desactivarDemoMeta(concesionariaId: number): Promise<BajaDemo & { integracionId: number }> {
    const integracion = await buscarIntegracionDemo(concesionariaId);
    if (!integracion) {
        throw new BaseException(
            409,
            'El modo demostración de Instagram y Facebook no está activo en esta concesionaria.',
            'META_SIN_INTEGRACION_DEMO',
        );
    }

    const borrado = await withTenantTransaction(async (tx) => {
        // `tx` NO pasa por la extensión: el concesionariaId va a mano en cada
        // where (para un super_admin nadie lo inyecta) y el delete es el físico
        // de verdad, no el soft-delete que reescribe la extensión.
        //
        // Los hilos se leen ANTES de borrar: el `clienteId` es el único puente
        // hacia el CRM y muere con la fila.
        const hilos = await tx.conversacion.findMany({
            where: { concesionariaId, integracionId: integracion.id },
            select: { id: true, clienteId: true },
        });
        const ids = hilos.map((h) => h.id);

        // Los mensajes van primero: apuntan a la conversación.
        const mensajes = ids.length === 0
            ? { count: 0 }
            : await tx.mensajeWhatsapp.deleteMany({ where: { concesionariaId, conversacionId: { in: ids } } });
        const conversaciones = ids.length === 0
            ? { count: 0 }
            : await tx.conversacion.deleteMany({ where: { concesionariaId, id: { in: ids } } });
        await tx.integracionCanal.deleteMany({ where: { concesionariaId, id: integracion.id } });

        return {
            conversacionesEliminadas: conversaciones.count,
            mensajesEliminados: mensajes.count,
            // Distintos: varios hilos pueden haber caído en la misma ficha.
            clientesConservados: new Set(
                hilos.map((h) => h.clienteId).filter((id): id is number => id != null),
            ).size,
        };
    });

    logger.info(
        `[integraciones-demo] modo demostración de Meta apagado en la concesionaria ${concesionariaId}: `
        + `${borrado.conversacionesEliminadas} conversaciones y ${borrado.mensajesEliminados} mensajes borrados, `
        + `${borrado.clientesConservados} clientes conservados`,
    );
    return { ...borrado, integracionId: integracion.id };
}
