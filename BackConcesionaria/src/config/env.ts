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
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(10),
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
}).superRefine((data, ctx) => {
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
