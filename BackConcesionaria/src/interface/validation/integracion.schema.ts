import { z } from 'zod';

// Schemas de validación de las integraciones de canal: webhook de Meta
// (formularios de campaña, mensajes y comentarios de Instagram/Facebook) o
// casilla IMAP (avisos de DeRuedas). `config` se valida DISCRIMINADO por `tipo`
// — cada canal guarda credenciales distintas — y viaja al modelo
// IntegracionCanal como Json.

// Canal por el que entra la consulta (espejo del enum OrigenLead de Prisma).
const ORIGENES_LEAD = ['deruedas', 'instagram', 'facebook', 'whatsapp', 'web', 'mostrador', 'referido', 'otro'] as const;

const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// ── Config por tipo de canal ─────────────────────────────────────────────────

// Los ids de Meta (página, cuenta de Instagram) son numéricos larguísimos: se
// guardan como STRING porque pasan el entero seguro de JS y nunca se hace
// aritmética con ellos. Un '' se normaliza a undefined ANTES de validar para
// que el formulario pueda mandar el campo vacío sin comerse "tiene que ser
// numérico" (el controller interpreta ese '' como "borrar", ver
// OPCIONALES_BORRABLES_META).
const idMetaOpcional = (etiqueta: string) =>
    z.preprocess(
        (v) => {
            if (typeof v !== 'string') return v;
            const limpio = v.trim();
            return limpio === '' ? undefined : limpio;
        },
        z.string()
            .regex(/^\d{5,25}$/, `${etiqueta} tiene que ser el id numérico que muestra Meta (sólo dígitos)`)
            .optional(),
    );

// Meta: el webhook valida verifyToken en el handshake (GET) y firma cada POST
// con appSecret; los tokens de acceso se usan para pedirle datos al Graph API y
// para responder (Send API / comentarios).
//
// Base sin refinamientos para poder derivar el schema del PATCH con .partial().
// Los campos de los canales nuevos (página, Instagram) son TODOS OPCIONALES a
// propósito: el PATCH revalida la config mergeada contra el schema COMPLETO, y
// un campo obligatorio nuevo dejaría sin poder editarse a toda integración meta
// que ya existe (las de Lead Ads, que sólo tienen los cuatro campos viejos).
// Qué permiso habilita cada uno y cómo conseguirlo: ver ConfigMeta en
// domain/services/canalesMeta.ts (fuente de verdad del contrato del config).
const metaConfigBase = z.object({
    origen: z.enum(['instagram', 'facebook'], {
        error: 'Origen inválido. Válidos: instagram, facebook',
    }),
    verifyToken: z.string().min(1, 'El verify token es obligatorio'),
    appSecret: z.string().min(1, 'El app secret es obligatorio'),
    pageAccessToken: z.string().min(1, 'El page access token es obligatorio'),
    // Id público de la página de Facebook. Habilita los canales del objeto
    // `page` (Messenger y comentarios de la página): con él verificamos que el
    // evento sea de nuestra página y reconocemos nuestros propios mensajes.
    pageId: idMetaOpcional('El id de la página'),
    // Id público de la cuenta profesional de Instagram (IGID). Habilita los
    // canales del objeto `instagram` (DM y comentarios).
    igBusinessAccountId: idMetaOpcional('El id de la cuenta de Instagram'),
    // SECRETO. Sólo si la app usa el flujo "Instagram Login", que emite un token
    // propio de la cuenta de IG; con "Facebook Login for Business" va vacío y se
    // usa el token de la página. Sin .min(1): un '' significa "no cambiar" y lo
    // resuelve el merge del controller, no la validación.
    instagramAccessToken: z.string().optional(),
});

export const metaConfigSchema = metaConfigBase;

// Email (IMAP): credenciales de la casilla donde caen los avisos de consultas.
export const emailConfigSchema = z.object({
    origen: z.enum(ORIGENES_LEAD, {
        error: 'Origen inválido. Válidos: deruedas, instagram, facebook, whatsapp, web, mostrador, referido, otro',
    }).default('deruedas'),
    host: z.string().min(1, 'El host IMAP es obligatorio'),
    port: z.coerce.number().int().positive().default(993),
    secure: z.boolean().default(true),
    user: z.string().min(1, 'El usuario es obligatorio'),
    pass: z.string().min(1, 'La contraseña es obligatoria'),
    carpeta: z.string().min(1).default('INBOX'),
});

export type MetaConfig = z.infer<typeof metaConfigSchema>;
export type EmailConfig = z.infer<typeof emailConfigSchema>;

// Campos de config que son secretos: la lista se enmascara en GET y en update
// "vacío u omitido = conservar el guardado" (el front nunca ve el valor real,
// así que no puede reenviarlo).
//
// RE-EXPORT, no una copia: la lista canónica vive en secretBox.ts, que es quien
// cifra. Cuando estaban duplicadas, agregar un token a una sola de las dos lo
// dejaba en claro en la base o en claro en la API — un bug mudo.
export { CAMPOS_SECRETOS } from '../../infrastructure/security/secretBox';

// Campos opcionales NO secretos de meta que el admin puede querer BORRAR. Para
// los secretos, '' significa "conservar el guardado" (el front nunca los ve);
// para estos ids, en cambio, '' significa "borralo": sin esta lista el merge
// del controller los dejaría pegados para siempre con el valor viejo.
export const OPCIONALES_BORRABLES_META = ['pageId', 'igBusinessAccountId'] as const;

// ── Create ───────────────────────────────────────────────────────────────────

export const createIntegracionSchema = z.discriminatedUnion('tipo', [
    z.object({
        // super_admin elige tenant por body (resolveConcesionariaId en el
        // controller); admin: se ignora y va el del token.
        concesionariaId: optionalFk,
        tipo: z.literal('meta'),
        nombre: z.string({ error: 'El nombre es obligatorio' }).min(1, 'El nombre es obligatorio'),
        activo: z.boolean().optional(),
        config: metaConfigSchema,
    }),
    z.object({
        concesionariaId: optionalFk,
        tipo: z.literal('email'),
        nombre: z.string({ error: 'El nombre es obligatorio' }).min(1, 'El nombre es obligatorio'),
        activo: z.boolean().optional(),
        config: emailConfigSchema,
    }),
]);

// ── Update ───────────────────────────────────────────────────────────────────
// PATCH no permite cambiar `tipo`: config viene PARCIAL y el controller la
// valida contra el tipo GUARDADO y la mergea sobre la config existente. Los
// secretos que llegan '' (o ausentes) significan "conservar el guardado":
// se aceptan acá y el merge del controller los descarta.

// Se deriva de la BASE (no de metaConfigSchema) para no arrastrar refinamientos
// si alguna vez se le agregan. Los secretos se re-extienden explícitos: bajo
// .partial() el .min(1) sigue vivo y rechazaría el '' que el front manda como
// "no cambiar".
export const updateMetaConfigSchema = metaConfigBase.partial().extend({
    appSecret: z.string().optional(),
    pageAccessToken: z.string().optional(),
    instagramAccessToken: z.string().optional(),
});

// OJO: NO se deriva con emailConfigSchema.partial() — en Zod los .default()
// disparan igual bajo .partial() (verificado), y un PATCH parcial resetearía
// port/secure/carpeta/origen guardados a sus defaults al mergear. Acá todo es
// opcional y SIN defaults: sólo lo que vino pisa lo guardado.
export const updateEmailConfigSchema = z.object({
    origen: z.enum(ORIGENES_LEAD, {
        error: 'Origen inválido. Válidos: deruedas, instagram, facebook, whatsapp, web, mostrador, referido, otro',
    }).optional(),
    host: z.string().min(1, 'El host IMAP no puede estar vacío').optional(),
    port: z.coerce.number().int().positive().optional(),
    secure: z.boolean().optional(),
    user: z.string().min(1, 'El usuario no puede estar vacío').optional(),
    pass: z.string().optional(),
    carpeta: z.string().min(1).optional(),
});

export const updateIntegracionSchema = z.object({
    nombre: z.string().min(1, 'El nombre no puede estar vacío').optional(),
    activo: z.boolean().optional(),
    // Validación fina por tipo en el controller (acá no sabemos el tipo guardado).
    config: z.record(z.string(), z.unknown()).optional(),
    // Sin concesionariaId ni tipo: no hay reasignación de tenant ni de canal.
});
