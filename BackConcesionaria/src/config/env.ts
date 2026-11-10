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
    // Default SEGURO: si alguien arranca sin NODE_ENV (otro entorno, un script, npm start a mano) se
    // asume producción — sin Swagger, sin stack traces en las respuestas y con las validaciones de
    // secretos. El desarrollo lo pide explícito (NODE_ENV=development, ver .env.example).
    NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
    // Sin PORT el preprocess anterior daba NaN y el arranque fallaba: el default(3000) nunca aplicaba.
    PORT: z.preprocess((val) => (val === undefined || val === '' ? undefined : Number(val)), z.number().default(3000)),
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
    // Válvula de escape para NO exigir el rol app_rw en producción (ver el chequeo de abajo). Sólo
    // para una migración de emergencia: con '1' la app puede correr como superusuario y la RLS queda inactiva.
    ALLOW_SUPERUSER_DB: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['0', '1']).optional()),
    JWT_SECRET: z.string().min(10),
    // Clave de cifrado en reposo de los secretos de integraciones y del 2FA (AES-256-GCM).
    // 64 hex = 32 bytes: `openssl rand -hex 32`. OBLIGATORIA en producción (ver el
    // superRefine). En desarrollo/test es opcional: sin ella los secretos se guardan en
    // claro (warning al arranque; los protege sólo la RLS).
    // Es la clave ACTUAL: con ella se cifra todo lo que se guarda (formato v2, ver secretBox.ts).
    INTEGRACIONES_SECRET_KEY: z.preprocess(
        (v) => (v === '' ? undefined : v),
        z.string().regex(/^[0-9a-fA-F]{64}$/, 'INTEGRACIONES_SECRET_KEY debe ser 64 caracteres hex (openssl rand -hex 32)').optional(),
    ),
    // Rotación: claves VIEJAS, separadas por comas, que sólo sirven para LEER lo que se cifró
    // con ellas hasta que `npm run recifrar-secretos -- --apply` lo pase a la actual. Nunca se
    // cifra con estas. Vacía = sin rotación en curso (lo normal). Procedimiento completo en
    // docs/seguridad/criptografia-y-secretos.md. Los mensajes de error nunca incluyen el valor.
    INTEGRACIONES_SECRET_KEYS_ANTERIORES: z.preprocess(
        (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter((s) => s !== '') : v),
        z.array(
            z.string().regex(/^[0-9a-fA-F]{64}$/, 'Cada clave de INTEGRACIONES_SECRET_KEYS_ANTERIORES debe ser de 64 caracteres hex (openssl rand -hex 32), separadas por comas'),
        ).default([]),
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
    // ── Alertas de seguridad ─────────────────────────────────────────────────
    // Webhook OPCIONAL que recibe un POST JSON por cada evento de seguridad que alguien
    // tiene que mirar ya: racha de logins fallidos, reuso de un refresh token (sesión
    // robada) y login de super_admin. Sirve cualquier receptor de webhooks (Slack,
    // Discord, un bot de Telegram detrás de un relay, n8n…). Vacía = sin alertas
    // (quedan igual en security_events y en el log). En producción tiene que ser https.
    SECURITY_ALERT_WEBHOOK_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
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
    // Claves anteriores sin una actual: se podría leer lo viejo pero todo lo nuevo se
    // guardaría EN CLARO (sin clave actual no hay con qué cifrar). Casi seguro es una rotación
    // a medias (se movió la clave a ANTERIORES y no se cargó la nueva). Aplica en todo entorno.
    if (data.INTEGRACIONES_SECRET_KEYS_ANTERIORES.length > 0 && !data.INTEGRACIONES_SECRET_KEY) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['INTEGRACIONES_SECRET_KEY'],
            message: 'Hay INTEGRACIONES_SECRET_KEYS_ANTERIORES pero falta INTEGRACIONES_SECRET_KEY: la actual es la única con la que se cifra. Al rotar, la clave nueva va en INTEGRACIONES_SECRET_KEY y la vieja en ANTERIORES.',
        });
    }
    if (data.NODE_ENV !== 'production') return;
    // En producción el runtime TIENE que correr como app_rw. Sin APP_DATABASE_URL caía en silencio a
    // DATABASE_URL (superusuario) y la RLS de Postgres quedaba decorativa: el aislamiento entre
    // concesionarias dependía sólo de la capa de aplicación. Ahora el arranque falla, con el motivo.
    if (!data.APP_DATABASE_URL && data.ALLOW_SUPERUSER_DB !== '1') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['APP_DATABASE_URL'],
            message: 'En producción APP_DATABASE_URL (rol app_rw) es obligatoria: sin ella la app correría como superusuario y la RLS no filtraría. Configurala junto con APP_DB_PASSWORD (ver .env.example) o, sólo en una emergencia, ALLOW_SUPERUSER_DB=1.',
        });
    }
    // Sin la clave, cifrarSecreto() guarda en CLARO los secretos TOTP (el segundo factor de
    // cada usuario), los tokens de Meta y las contraseñas IMAP: un volcado de la base o un
    // backup sin cifrar anulaba el 2FA y daba las credenciales de los canales. En producción
    // el cifrado en reposo no puede ser opcional: el arranque falla con el motivo.
    if (!data.INTEGRACIONES_SECRET_KEY) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['INTEGRACIONES_SECRET_KEY'],
            message: 'En producción INTEGRACIONES_SECRET_KEY es obligatoria (64 hex: openssl rand -hex 32): sin ella los secretos del 2FA y de las integraciones se guardarían en claro. Guardá una copia fuera del servidor: sin la misma clave no se pueden leer los secretos ya cifrados.',
        });
    }
    // Las alertas viajan con ids y emails enmascarados: en producción no van en claro.
    if (data.SECURITY_ALERT_WEBHOOK_URL && !data.SECURITY_ALERT_WEBHOOK_URL.startsWith('https://')) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SECURITY_ALERT_WEBHOOK_URL'],
            message: 'En producción SECURITY_ALERT_WEBHOOK_URL tiene que ser https://.',
        });
    }
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
