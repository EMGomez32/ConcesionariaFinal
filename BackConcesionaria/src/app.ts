import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { apiLimiter } from './interface/middlewares/rateLimiters';
import { env } from './config/env';
import { contextMiddleware } from './interface/middlewares/context.middleware';
import { requestLogger } from './interface/middlewares/requestLogger.middleware';
import { errorHandler } from './interface/middlewares/error.middleware';
import { notFound } from './interface/middlewares/notFound.middleware';
import routes from './routes';
import webhookRoutes from './interface/routes/webhook.routes';
import integracionRoutes from './interface/routes/integracion.routes';
import { authenticate } from './interface/middlewares/authenticate.middleware';
import prisma from './infrastructure/database/prisma';
import { logger } from './infrastructure/logging/logger';

const app = express();

// Confiar en el/los proxy(s) delante de la app (nginx, Cloudflare) para que
// req.ip lea el X-Forwarded-For real. Sin esto, el rate limiting ve a todos
// los clientes como la IP interna del proxy y queda anulado.
app.set('trust proxy', env.TRUST_PROXY);

// Security Middlewares
// Versión "dev-friendly":
//  - HSTS 1 año + includeSubDomains, sin preload (para no quedar atado).
//  - CSP heredada del default (permite 'unsafe-inline' en styles, no en scripts).
//  - crossOriginResourcePolicy 'cross-origin' para que el frontend pueda
//    consumir /uploads desde su origen (sino el browser bloquea la imagen).
//  - referrerPolicy strict-origin-when-cross-origin (no leak del path).
app.use(helmet({
    hsts: {
        maxAge: 60 * 60 * 24 * 365, // 1 año
        includeSubDomains: true,
        preload: false,
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Permissions-Policy: bloquea features del browser que no usamos.
// Helmet 8 no incluye este header por default, lo seteamos a mano.
app.use((_req, res, next) => {
    res.setHeader(
        'Permissions-Policy',
        [
            'accelerometer=()',
            'camera=()',
            'geolocation=()',
            'gyroscope=()',
            'magnetometer=()',
            'microphone=()',
            'payment=()',
            'usb=()',
            'interest-cohort=()',
        ].join(', ')
    );
    next();
});

// Rate limiting global. El limiter estricto de /auth/login se aplica aparte,
// en auth.routes.ts. Ver interface/middlewares/rateLimiters.ts.
app.use(apiLimiter);

// CORS — solo browsers de la app permitida.
// Requests sin Origin (curl, Postman, healthcheck server-to-server) se
// permiten porque CORS no aporta seguridad ahí — la auth JWT los frena.
// Para producción, sumar el dominio real al env CORS_ALLOWED_ORIGINS.
const allowedOrigins = env.CORS_ALLOWED_ORIGINS
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        // Denegado: callback(null, false) NO setea Access-Control-Allow-Origin,
        // así el browser bloquea solo. Evita generar 500 desde el errorHandler
        // y deja un log explícito.
        logger.warn(`[cors] origin rechazado: ${origin}`);
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
    // Por defecto el browser sólo deja leer un puñado de headers seguros: el
    // resto queda invisible para el JS aunque el server los mande. Los CSV de
    // reportes traen el nombre de archivo (con el período) en el
    // Content-Disposition, y sin exponerlo el front no puede usarlo.
    // X-Export-Truncated: lo setean los exports que se topan con su límite (5000)
    // para que el front avise "se exportaron N de M"; sin exponerlo, el toast se
    // pierde en cross-origin (dev) — en prod es same-origin y no hace falta.
    exposedHeaders: ['Content-Disposition', 'X-Export-Truncated'],
    maxAge: 86400, // cachear el preflight 24h
}));

// Basic Middlewares
// verify: el webhook de Meta valida X-Hub-Signature-256 sobre el body CRUDO;
// se guarda el buffer original SOLO para /api/webhooks (el resto no lo necesita
// y no vale la pena duplicar cada body en memoria).
app.use(express.json({
    verify: (req, _res, buf) => {
        const url = (req as any).originalUrl || (req as any).url || '';
        if (url.startsWith('/api/webhooks/')) {
            (req as any).rawBody = buf;
        }
    },
}));
app.use(express.urlencoded({ extended: true }));

// Disable caching in development
if (env.NODE_ENV === 'development') {
    app.use((_req, res, next) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        next();
    });
}

// Core Middleware: Multi-tenancy Context
app.use(contextMiddleware);
app.use(requestLogger);

// Health check (simplified using extended prisma)
app.get('/health', async (_req, res) => {
    try {
        await (prisma as any).$queryRaw`SELECT 1`;
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(503).json({ status: 'unhealthy', error: 'Database unavailable' });
    }
});

// Archivos subidos (servidos como estáticos). Endurecido: aunque el contenido
// se valida al subir, /uploads es same-origin con la SPA, así que un archivo
// malicioso servido inline sería un XSS/phishing en el dominio confiable. Estas
// cabeceras lo neutralizan: `nosniff` evita que un binario mal etiquetado se
// interprete como HTML, y la CSP `sandbox` (sin tokens) hace que cualquier
// HTML/SVG servido corra en un origen aislado y sin scripts.
const uploadsDir = process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir, {
    maxAge: '7d',
    etag: true,
    setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox; frame-ancestors 'none'");
    },
}));

// Webhooks públicos de integraciones (Meta Lead Ads): SIN JWT — montados ANTES
// del router /api (que aplica authenticate global). La seguridad es la del
// canal: verify token en el handshake (GET) y firma HMAC del body en el POST.
app.use('/api/webhooks', webhookRoutes);

// Integraciones de canal (credenciales de Meta/IMAP): autenticado como el
// resto de la API; authorize('admin') va dentro del router.
app.use('/api/integraciones', authenticate, integracionRoutes);

// Rutas de la API
app.use('/api', routes);

// Swagger: sólo fuera de producción. En prod, /api-docs expondría toda la
// superficie de la API (y las credenciales demo de los ejemplos de login) sin
// aportar valor. Carga perezosa (require dentro del guard) para no arrastrar el
// toolchain de Swagger cuando NODE_ENV=production. El mount va ANTES de notFound.
if (env.NODE_ENV !== 'production') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const swaggerUi = require('swagger-ui-express');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const swaggerSpecs = require('./config/swagger').default;
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
        explorer: true,
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Concesionaria API Docs',
    }));
    logger.info('[swagger] docs habilitados en /api-docs (no-producción)');
}

// Error Handling
app.use(notFound);
app.use(errorHandler);

export default app;
