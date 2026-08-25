import { z } from 'zod';

/**
 * Schemas de la integración con Mercado Libre: publicación de un vehículo y
 * bandeja de preguntas.
 *
 * Zod descarta las claves no declaradas (validate.middleware reemplaza el body
 * por el parseado) => corta el mass-assignment. Ojo con lo que NO se declara a
 * propósito:
 *  - Al publicar: `precio` y `moneda`. Salen SIEMPRE de la ficha del vehículo.
 *    Aceptarlos por body dejaría publicar un valor distinto al de la ficha, y la
 *    sincronización automática se lo pisaría en el ciclo siguiente: el vendedor
 *    vería un precio que "se cambia solo".
 *  - Al publicar: `itemId`, `permalink`, `estado`. Los devuelve Mercado Libre.
 *  - Al responder: `estado` y `respondidaEn`. Se fijan cuando ML acepta la
 *    respuesta, no cuando el panel la manda.
 */

// FK que SÍ admite null explícito (para DESASIGNAR): '' / 0 / null => null, un
// id positivo => asigna. Mismo patrón que cliente.schema.ts / whatsapp.schema.ts.
const nullableFk = (msg: string) =>
    z.preprocess(
        (v) => (v === '' || v === 0 || v === null ? null : v),
        z.coerce.number({ error: msg }).int(msg).positive(msg).nullable(),
    );

// Texto opcional donde el form manda '' al dejarlo en blanco: '' => undefined
// (campo ausente), nunca una cadena vacía persistida.
const textoOpcional = (max: number, msg: string) =>
    z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(max, msg).optional());

// Tenant elegido por body. Tiene que SOBREVIVIR al strip de Zod porque para un
// super_admin la extensión no inyecta concesionariaId y es la única forma de
// decir sobre qué concesionaria se opera; para el resto `resolveConcesionariaId`
// lo ignora y usa el del token, así que declararlo no abre nada.
const concesionariaOpcional = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

/**
 * Encender el modo demostración / sembrar sus preguntas de ejemplo. No lleva
 * ningún campo propio a propósito: qué cuenta se crea y con qué datos lo decide
 * el servidor (mlUserId, nickname y site son fijos), así que el body sólo sirve
 * para que un super_admin elija concesionaria. El schema existe para que Zod
 * descarte cualquier otra clave: sin él, un body con `modo: 'real'` o
 * `accessToken` llegaría crudo al controller.
 *
 * El preprocess NO es cosmético: son botones que se aprietan sin datos, y en
 * Express 5 un POST sin cuerpo deja `req.body` en `undefined` (body-parser ya no
 * lo inicializa en `{}`). Sin esto, `z.object` rechazaría la llamada con un 400
 * de validación por un body que nunca hizo falta mandar.
 */
export const demoSchema = z.preprocess(
    (v) => (v === undefined || v === null ? {} : v),
    z.object({
        concesionariaId: concesionariaOpcional,
    }),
);

/**
 * Publicar un vehículo. El `listingTypeId` es obligatorio a propósito: cada tipo
 * de publicación tiene un costo distinto (los trae en vivo GET
 * /mercadolibre/vehiculos/{id}/opciones), así que la elección es del usuario y
 * no puede tener default silencioso — publicar es una operación que cobra plata.
 */
export const publicarSchema = z.object({
    listingTypeId: z
        .string({ error: 'Elegí un tipo de publicación' })
        .trim()
        .min(1, 'Elegí un tipo de publicación'),
    // Tope duro de Mercado Libre: 60 caracteres. Se corta acá para no gastar una
    // llamada a la API que va a volver rechazada con un mensaje en inglés.
    // Ausente => el service arma el título con marca, modelo, versión y año.
    titulo: textoOpcional(60, 'El título no puede superar los 60 caracteres'),
    // Ausente => el service la resuelve con el predictor de categorías de ML.
    // Se acepta para poder corregir a mano cuando el predictor le erra.
    categoriaId: textoOpcional(60, 'La categoría no puede superar los 60 caracteres'),
});

/**
 * Responder una pregunta. El tope de 2000 es el de la API de ML: pasarse hace
 * fallar la publicación de la respuesta después de haberla dado por enviada.
 */
export const responderSchema = z.object({
    texto: z
        .string({ error: 'La respuesta no puede estar vacía' })
        .trim()
        .min(1, 'La respuesta no puede estar vacía')
        .max(2000, 'La respuesta no puede superar los 2000 caracteres'),
});

/**
 * Asignar la pregunta a un vendedor. `usuarioId` es OBLIGATORIO pero admite null:
 * null des-asigna y devuelve la pregunta a la cola común (que es justamente lo
 * que ve un vendedor puro), así que no puede colapsarse a undefined.
 */
export const asignarSchema = z.object({
    usuarioId: nullableFk('usuarioId inválido'),
});

/**
 * Convertir la pregunta en lead. Todo opcional: la ingesta deduplica por
 * teléfono/email y, si no viene nada, arma el cliente con el nombre de contacto
 * que expone Mercado Libre (la API no da teléfono ni email del preguntador).
 */
export const leadSchema = z.object({
    nombre: textoOpcional(120, 'El nombre no puede superar los 120 caracteres'),
    telefono: textoOpcional(30, 'El teléfono no puede superar los 30 caracteres'),
    // '' => undefined (el form lo manda vacío cuando no se cargó): un lead sin
    // email es lo normal. Un email real sigue exigiendo formato válido.
    email: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().toLowerCase().email('Email inválido').optional()),
    // null / ausente => el service asigna por round-robin.
    vendedorId: nullableFk('vendedorId inválido').optional(),
});
