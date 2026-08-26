import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Secretos de desarrollo que NUNCA deben usarse en producción.
// Si alguno aparece con NODE_ENV=production, el arranque se aborta.
const KNOWN_DEV_SECRETS = new Set([
    'super_secret_dev_key_123',
    'super_secret_refresh_dev_key_456',
    'changeme',
    'secret',
]);

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.preprocess((val) => Number(val), z.number().default(3000)),
    // DATABASE_URL = conexión ADMIN (superusuario). La usan SOLO las tareas de
    // setup del arranque: `prisma db push` (DDL), init-rls (FORCE RLS + policies)
    // y setup-app-role (crea el rol de app + grants). NO la usa el runtime.
    DATABASE_URL: z.string().url(),
    // APP_DATABASE_URL = conexión de RUNTIME de la app (rol NO superusuario
    // `app_rw`, para que la RLS de Postgres SÍ filtre — un superusuario la
    // saltea). Opcional: si no está seteada, el runtime cae a DATABASE_URL
    // (comportamiento actual, RLS inactiva). '' se trata como no seteada.
    APP_DATABASE_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
    // Password del rol app_rw. setup-app-role sólo crea/actualiza el rol si está
    // presente; el usuario la fija en el .env junto con APP_DATABASE_URL.
    APP_DB_PASSWORD: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    JWT_SECRET: z.string().min(10),
    // Clave de cifrado en reposo de los secretos de integraciones (AES-256-GCM).
    // 64 hex = 32 bytes: `openssl rand -hex 32`. Opcional: sin ella los secretos
    // se guardan en claro (warning al arranque; los protege sólo la RLS).
    INTEGRACIONES_SECRET_KEY: z.preprocess(
        (v) => (v === '' ? undefined : v),
        z.string().regex(/^[0-9a-fA-F]{64}$/, 'INTEGRACIONES_SECRET_KEY debe ser 64 caracteres hex (openssl rand -hex 32)').optional(),
    ),
    JWT_REFRESH_SECRET: z.string().min(10),
    JWT_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    LOG_LEVEL: z.string().default('debug'),
    CORS_ALLOWED_ORIGINS: z.string().optional().default('http://localhost:5173,http://localhost:3000'),
    UPLOADS_DIR: z.string().optional(),
    // URL pública del frontend, para armar el link de recuperación de contraseña.
    APP_URL: z.string().optional().default('http://localhost'),
    // SMTP para envío de emails (opcional). Si no está configurado, el link de
    // reseteo se escribe en los logs en vez de enviarse por email.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().optional()),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    // Cantidad de proxies de confianza delante de la app (nginx, Cloudflare).
    // Necesario para que req.ip lea el X-Forwarded-For real y el rate limit
    // no vea a todos como la IP interna del proxy. Con 1 nginx delante: 1.
    TRUST_PROXY: z.preprocess((val) => (val === undefined ? 1 : Number(val)), z.number().int().min(0).default(1)),
    // --- Mercado Libre ---
    // Credenciales de la app creada en developers.mercadolibre.com.ar. Las dos
    // son OPCIONALES: sin ellas el backend arranca igual y la integración queda
    // simplemente APAGADA (hayCredencialesMeli() da false, el worker no corre y
    // la pantalla de Configuración muestra "no configurada"). Nunca rompen el
    // arranque, para no dejar sin sistema a las concesionarias que no publican
    // en Mercado Libre.
    ML_CLIENT_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    ML_CLIENT_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    // Redirect URI del OAuth. Tiene que coincidir EXACTO (protocolo, host, path,
    // sin barra de más) con la cargada en la app de Mercado Libre, o el canje
    // del code falla con invalid_grant. Si no se setea, se arma sola como
    // <APP_URL>/api/webhooks/mercadolibre/callback.
    ML_REDIRECT_URI: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    // Sitio de Mercado Libre: MLA = Argentina, MLU = Uruguay, MLC = Chile.
    // Define el host de autorización y el de las categorías/tipos de publicación.
    ML_SITE_ID: z.string().default('MLA'),
    // Cada cuánto barre el worker de sincronización (preguntas perdidas del
    // webhook + reconciliación de precio/estado de los items). Bajarlo mucho
    // quema la cuota de la API, que es por aplicación y no por vendedor.
    ML_SYNC_INTERVAL_MS: z.preprocess(
        (v) => (v === undefined || v === '' ? undefined : Number(v)),
        z.number().int().min(30_000).default(300_000),
    ),
    // ── Cierre automático de atenciones (módulo del vendedor) ────────────────
    // Hora local a la que se considera cerrado el día. A partir de ahí, toda
    // atención que siga `abierta` la cierra el sistema y el vendedor recibe la
    // alerta con cuántas dejó sin cerrar. 21 h es el cierre típico de un salón.
    ATENCION_CIERRE_HORA: z.preprocess(
        (v) => (v === undefined || v === '' ? undefined : Number(v)),
        z.number().int().min(0).max(23).default(21),
    ),
    // Offset horario del salón respecto de UTC. Argentina es UTC−3 todo el año
    // (no hay horario de verano desde 2009). Es un número y no un nombre de zona
    // a propósito: sin `Intl`/tzdata garantizados en el contenedor, un offset fijo
    // es más predecible que una zona que puede resolver mal y correr el corte.
    ATENCION_CIERRE_UTC_OFFSET: z.preprocess(
        (v) => (v === undefined || v === '' ? undefined : Number(v)),
        z.number().int().min(-12).max(14).default(-3),
    ),
}).superRefine((data, ctx) => {
    // ML_CLIENT_ID y ML_CLIENT_SECRET van juntas o ninguna: con una sola el
    // OAuth falla recién al canjear el code, muy lejos del error real.
    if (!!data.ML_CLIENT_ID !== !!data.ML_CLIENT_SECRET) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [data.ML_CLIENT_ID ? 'ML_CLIENT_SECRET' : 'ML_CLIENT_ID'],
            message: 'ML_CLIENT_ID y ML_CLIENT_SECRET deben setearse juntas (o ninguna): con una sola la integración de Mercado Libre no puede canjear el token.',
        });
    }
    // Cutover al rol app_rw: APP_DATABASE_URL y APP_DB_PASSWORD van juntas o
    // ninguna (setear sólo una es misconfiguración). Aplica en todo entorno.
    if (!!data.APP_DATABASE_URL !== !!data.APP_DB_PASSWORD) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [data.APP_DATABASE_URL ? 'APP_DB_PASSWORD' : 'APP_DATABASE_URL'],
            message: 'APP_DATABASE_URL y APP_DB_PASSWORD deben setearse juntas (o ninguna): el cutover al rol app_rw necesita ambas.',
        });
    }
    if (data.NODE_ENV !== 'production') return;
    for (const [key, value] of [['JWT_SECRET', data.JWT_SECRET], ['JWT_REFRESH_SECRET', data.JWT_REFRESH_SECRET]] as const) {
        if (KNOWN_DEV_SECRETS.has(value)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [key],
                message: `${key} usa un valor de desarrollo conocido. Generá un secreto aleatorio para producción.`,
            });
        }
    }
    if (data.JWT_SECRET === data.JWT_REFRESH_SECRET) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['JWT_REFRESH_SECRET'],
            message: 'JWT_REFRESH_SECRET debe ser distinto de JWT_SECRET.',
        });
    }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
    process.exit(1);
}

export const env = parsed.data;
