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
        // En tests no queremos que el rate limit interfiera.
        return isTest;
    },
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
