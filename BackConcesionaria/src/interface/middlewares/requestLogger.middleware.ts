import { Request, Response, NextFunction } from 'express';
import { logger } from '../../infrastructure/logging/logger';
import { context } from '../../infrastructure/security/context';
import { textoParaLog } from '../../utils/textoParaLog';

export { textoParaLog };

/**
 * Query params que no pueden quedar escritos en el log. En producción el log sale a
 * stdout y Docker lo persiste: cualquiera con acceso a los logs (o a un volcado) los
 * tendría en claro, y fuera del alcance de una supresión de datos del titular.
 *
 *  - CREDENCIALES: el callback de OAuth de Mercado Libre llega como
 *    `?code=...&state=...` (el `code` canjea los tokens del vendedor y el `state` ata una
 *    cuenta de ML a una concesionaria); `sig` es la firma de una URL de adjunto privado.
 *  - DATOS PERSONALES: las búsquedas viajan por query string (`/search?q=`,
 *    `/clientes?search=&dni=&telefono=&email=`): un DNI o un teléfono tipeado en el
 *    buscador terminaba en el log de cada request.
 */
const PARAMS_SENSIBLES = new Set([
    // credenciales
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
    'sig',
    // datos personales / búsquedas
    'q',
    'search',
    'buscar',
    'busqueda',
    'dni',
    'documento',
    'cuit',
    'cuil',
    'telefono',
    'celular',
    'whatsapp',
    'email',
    'nombre',
    'apellido',
    'direccion',
]);

/**
 * URL para el log: mismo path, con los valores sensibles enmascarados y sin saltos de
 * línea. Se conserva el NOMBRE del parámetro (sirve para diagnosticar) y se tira el valor.
 */
export const urlParaLog = (originalUrl: string): string => {
    const url = textoParaLog(originalUrl);
    const corte = url.indexOf('?');
    if (corte < 0) return url;
    const path = url.slice(0, corte);
    const params = new URLSearchParams(url.slice(corte + 1));
    let hayQue = false;
    for (const clave of [...params.keys()]) {
        if (!PARAMS_SENSIBLES.has(clave.toLowerCase())) continue;
        params.set(clave, '[redactado]');
        hayQue = true;
    }
    // URLSearchParams codifica los corchetes: se devuelven legibles para el que lee el log.
    return hayQue ? `${path}?${params.toString().replace(/%5Bredactado%5D/g, '[redactado]')}` : url;
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${textoParaLog(req.method)} ${urlParaLog(req.originalUrl)} ${res.statusCode} ${duration}ms`, {
            correlationId: context.getCorrelationId(),
            tenantId: context.getTenantId(),
            userId: context.getUser()?.userId
        });
    });
    next();
};
