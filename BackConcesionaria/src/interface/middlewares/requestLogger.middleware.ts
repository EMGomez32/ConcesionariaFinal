import { Request, Response, NextFunction } from 'express';
import { logger } from '../../infrastructure/logging/logger';
import { context } from '../../infrastructure/security/context';

/**
 * Query params que son CREDENCIALES y no pueden quedar escritos en el log.
 * El caso concreto es el callback de OAuth de Mercado Libre, que llega como
 * `GET /api/webhooks/mercadolibre/callback?code=...&state=...`: el `code` canjea
 * los tokens del vendedor y el `state` ata una cuenta de ML a una concesionaria.
 * En producción el log sale a stdout y Docker lo persiste, así que cualquiera
 * con acceso a los logs los tendría en claro.
 */
const PARAMS_SENSIBLES = new Set([
    'code',
    'state',
    'token',
    'access_token',
    'refresh_token',
    'refreshtoken',
    'password',
    'secret',
    'apikey',
    'api_key',
]);

/**
 * URL para el log: mismo path, con los valores sensibles enmascarados. Se
 * conserva el NOMBRE del parámetro (sirve para diagnosticar) y se tira el valor.
 */
export const urlParaLog = (originalUrl: string): string => {
    const corte = originalUrl.indexOf('?');
    if (corte < 0) return originalUrl;
    const path = originalUrl.slice(0, corte);
    const params = new URLSearchParams(originalUrl.slice(corte + 1));
    let hayQue = false;
    for (const clave of [...params.keys()]) {
        if (!PARAMS_SENSIBLES.has(clave.toLowerCase())) continue;
        params.set(clave, '[redactado]');
        hayQue = true;
    }
    return hayQue ? `${path}?${params.toString()}` : originalUrl;
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${urlParaLog(req.originalUrl)} ${res.statusCode} ${duration}ms`, {
            correlationId: context.getCorrelationId(),
            tenantId: context.getTenantId(),
            userId: context.getUser()?.userId
        });
    });
    next();
};
