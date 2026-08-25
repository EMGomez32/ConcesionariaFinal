import { Request } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../../config/env';
import { getClientIp } from '../../utils/clientIp';

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
// (skipSuccessfulRequests) y agrupa por IP + email, de modo que 5 fallos
// contra una misma cuenta la bloquean 15 minutos aunque el atacante rote IPs,
// y sin castigar a un usuario legítimo que se equivocó una vez y entró.
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
