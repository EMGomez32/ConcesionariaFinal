import { z } from 'zod';

// Schemas de validación de las integraciones de canal (ingesta automática de
// consultas): webhook de Meta (Lead Ads de Instagram/Facebook) o casilla IMAP
// (avisos de DeRuedas). `config` se valida DISCRIMINADO por `tipo` — cada canal
// guarda credenciales distintas — y viaja al modelo IntegracionCanal como Json.

// Canal por el que entra la consulta (espejo del enum OrigenLead de Prisma).
const ORIGENES_LEAD = ['deruedas', 'instagram', 'facebook', 'whatsapp', 'web', 'mostrador', 'referido', 'otro'] as const;

const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// ── Config por tipo de canal ─────────────────────────────────────────────────

// Meta (Lead Ads): el webhook valida verifyToken en el handshake (GET) y firma
// cada POST con appSecret; pageAccessToken se usa para pedir el lead al Graph API.
export const metaConfigSchema = z.object({
    origen: z.enum(['instagram', 'facebook'], {
        error: 'Origen inválido. Válidos: instagram, facebook',
    }),
    verifyToken: z.string().min(1, 'El verify token es obligatorio'),
    appSecret: z.string().min(1, 'El app secret es obligatorio'),
    pageAccessToken: z.string().min(1, 'El page access token es obligatorio'),
});

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
export const CAMPOS_SECRETOS = ['appSecret', 'pageAccessToken', 'pass'] as const;

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

export const updateMetaConfigSchema = metaConfigSchema.partial().extend({
    appSecret: z.string().optional(),
    pageAccessToken: z.string().optional(),
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
