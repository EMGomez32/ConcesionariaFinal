import { Request } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../../config/env';
import { getClientIp } from '../../utils/clientIp';
import { context } from '../../infrastructure/security/context';

const isTest = env.NODE_ENV === 'test';

// Clave por IP real del cliente. `getClientIp` prioriza CF-Connecting-IP (la IP
// del visitante detrás del Cloudflare Tunnel); si no, req.ip. Sin esto, detrás
// del túnel todos los clientes podían resolver a la misma IP interna y el
// límite por-IP se volvía un límite global. `ipKeyGenerator` normaliza IPv6
// (agrupa la subred del cliente), requerido por la librería.
const ipKey = (req: Request): string => ipKeyGenerator(getClientIp(req) || '');

// Limiter global de la API.
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300, // ~20/min por IP; holgado para uso normal, corta abuso
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: ipKey,
    skip: (req) => {
        if (req.path === '/health') return true;
        // Los webhooks de integraciones tienen su propio limiter (webhookLimiter):
        // un retry-storm de Meta desde una misma IP no debe comerse 429 acá.
        if (req.path.startsWith('/api/webhooks/')) return true;
        // En tests no queremos que el rate limit interfiera.
        return isTest;
    },
});

// Limiter propio de los webhooks públicos: mucho más holgado que el global
// (Meta reintenta en ráfagas ante fallas) pero con techo contra abuso, ya que
// las rutas no piden JWT.
//
// OJO con generalizar "las protege la firma": vale SÓLO para Meta, que firma el
// body con HMAC (X-Hub-Signature-256 → validarFirmaMeta → 403). Mercado Libre NO
// firma nada; ahí el filtro por `application_id` es descarte de ruido, no
// autenticación (el client_id viaja en la URL de OAuth, no es secreto). Para el
// webhook de ML, este limiter ES una de las defensas reales, junto con que el
// handler sólo procesa recursos de cuentas ya vinculadas y descarta toda pregunta
// cuyo seller_id no sea el de la cuenta.
export const webhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: ipKey,
    skip: () => isTest,
});

// Limiter estricto para el login. Cuenta SOLO los intentos fallidos
// (skipSuccessfulRequests) y agrupa por IP + email: 5 fallos desde una misma IP
// contra una misma cuenta la bloquean 15 minutos, sin castigar a un usuario
// legítimo que se equivocó una vez y entró. OJO: rotar IPs cambia la clave, así
// que NO frena un ataque distribuido contra una cuenta: para eso está
// loginAccountLimiter (por cuenta, sin importar la IP).
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: () => isTest,
    // Clave = IP real del cliente + email. `ipKey` prioriza CF-Connecting-IP
    // detrás del túnel; antes se usaba la IP cruda del socket, que detrás de
    // Cloudflare colapsaba a la interna y agrupaba el lockout por email solo.
    // (El comentario va acá, fuera del cuerpo: express-rate-limit valida el
    // .toString() del keyGenerator y una mención literal de la propiedad ip del
    // request adentro dispara un falso positivo de su chequeo de IPv6.)
    keyGenerator: (req) => {
        const email = String(req.body?.email || '').toLowerCase().trim();
        return `${ipKey(req)}:${email}`;
    },
    message: {
        error: 'TOO_MANY_ATTEMPTS',
        message: 'Demasiados intentos de inicio de sesión. Esperá 15 minutos e intentá de nuevo.',
    },
});

const MSG_DEMASIADOS = {
    error: 'TOO_MANY_REQUESTS',
    message: 'Demasiadas solicitudes. Esperá unos minutos e intentá de nuevo.',
};

const emailDelBody = (req: Request): string => String(req.body?.email || '').toLowerCase().trim();

// Lockout POR CUENTA: cuenta los intentos fallidos contra un mismo email SIN
// importar la IP. Es lo que frena un ataque distribuido (rotando IPs) contra una
// cuenta, que loginLimiter (IP+email) no ve. El límite es alto a propósito (20):
// un bloqueo por cuenta permite que un tercero deje afuera 15 min al usuario real
// mandando intentos fallidos, así que se deja margen para uso legítimo.
export const loginAccountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: () => isTest,
    keyGenerator: (req) => `acct:${emailDelBody(req)}`,
    message: {
        error: 'TOO_MANY_ATTEMPTS',
        message: 'Demasiados intentos de inicio de sesión. Esperá 15 minutos e intentá de nuevo.',
    },
});

// Recuperación de contraseña. loginLimiter NO servía acá: cuenta sólo los fallos
// y este endpoint siempre responde 200, así que nunca contaba (email-bombing a una
// víctima limitado sólo por el global). Estos dos cuentan TODAS las requests:
//  - por email (sin IP): como mucho 3 mails/15 min a una misma casilla, aunque el
//    atacante rote IPs. La clave es el texto del email, exista o no la cuenta, así
//    que el 429 no revela qué cuentas existen.
//  - por IP: techo contra quien barre muchos emails.
export const forgotPasswordEmailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 3,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => isTest || !emailDelBody(req),
    keyGenerator: (req) => `forgot:${emailDelBody(req)}`,
    message: MSG_DEMASIADOS,
});

export const forgotPasswordIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    keyGenerator: ipKey,
    message: MSG_DEMASIADOS,
});

// Renovación de sesión: una por sesión cada ~15 min (más pestañas); 120 por IP
// cada 15 min da aire a una oficina detrás de un mismo NAT y corta el martilleo.
export const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    keyGenerator: ipKey,
    message: MSG_DEMASIADOS,
});

// Reset con token: el token (32 bytes) no se puede adivinar, pero igual no hay
// razón para aceptar ráfagas de intentos.
export const resetPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    keyGenerator: ipKey,
    message: MSG_DEMASIADOS,
});

// ── Operaciones que cuestan (CPU, disco, cuota de APIs de terceros) ─────────────
// Se limitan POR USUARIO (no por IP: una oficina comparte IP). Van DESPUÉS de la
// autenticación, así que context.getUser() ya está poblado; sin usuario cae a la IP.
const perUser = (limit: number) =>
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skip: () => isTest,
        keyGenerator: (req) => {
            const uid = context.getUser()?.userId;
            return uid ? `u:${uid}` : ipKey(req);
        },
        message: MSG_DEMASIADOS,
    });

/** Subida de archivos (hasta 25 MB c/u, en memoria): 100 cada 15 min por usuario. */
export const uploadLimiter = perUser(100);
/** Envíos que salen a terceros (WhatsApp/Meta, Mercado Libre): 60 cada 15 min por usuario. */
export const envioLimiter = perUser(60);
/** PDFs y exportaciones CSV (consultas pesadas + render): 40 cada 15 min por usuario. */
export const costosoLimiter = perUser(40);
