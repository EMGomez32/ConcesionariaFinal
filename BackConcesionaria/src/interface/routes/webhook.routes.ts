import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../../infrastructure/logging/logger';
import { descifrarSecreto } from '../../infrastructure/security/secretBox';
import {
    buscarIntegracionMeta,
    resolverVerificacionMeta,
    validarFirmaMeta,
    procesarNotificacionMeta,
} from '../../infrastructure/integraciones/metaWebhook';

/**
 * Webhooks PÚBLICOS (sin JWT) — montados en app.ts FUERA del router /api (que
 * aplica authenticate global). La seguridad acá no es un token nuestro sino la
 * de cada canal: verify token en el handshake y firma HMAC del body en el POST.
 *
 * El body CRUDO que exige la firma lo guarda el hook `verify` de express.json
 * en app.ts (req.rawBody, sólo para /api/webhooks).
 */

const router = Router();

/**
 * @openapi
 * /webhooks/meta/{integracionId}:
 *   get:
 *     tags: [Webhooks]
 *     summary: Verificación de suscripción del webhook de Meta (público)
 *     security: []
 *     parameters:
 *       - { name: integracionId, in: path, required: true, schema: { type: integer } }
 *       - { name: hub.mode, in: query, schema: { type: string } }
 *       - { name: hub.verify_token, in: query, schema: { type: string } }
 *       - { name: hub.challenge, in: query, schema: { type: string } }
 *     responses:
 *       200: { description: Token válido, se responde hub.challenge en texto plano }
 *       403: { description: Token inválido o integración inexistente/inactiva }
 */
router.get('/meta/:integracionId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const integracionId = parseInt(req.params.integracionId as string, 10);
        const integracion = await buscarIntegracionMeta(integracionId);
        const challenge = integracion
            ? resolverVerificacionMeta(integracion, req.query as Record<string, unknown>)
            : null;
        if (challenge === null) {
            res.status(403).send('Forbidden');
            return;
        }
        res.status(200).type('text/plain').send(challenge);
    } catch (error) {
        next(error);
    }
});

/**
 * @openapi
 * /webhooks/meta/{integracionId}:
 *   post:
 *     tags: [Webhooks]
 *     summary: Notificación de leadgen de Meta (público, firmado con HMAC)
 *     description: >
 *       Valida X-Hub-Signature-256 (HMAC-SHA256 del body crudo con el appSecret
 *       del canal). Con firma válida responde 200 de inmediato y procesa los
 *       leads en background (Meta reintenta ante cualquier no-200).
 *     security: []
 *     parameters:
 *       - { name: integracionId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Evento recibido }
 *       403: { description: Firma inválida o integración inexistente/inactiva }
 */
router.post('/meta/:integracionId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const integracionId = parseInt(req.params.integracionId as string, 10);
        const integracion = await buscarIntegracionMeta(integracionId);
        if (!integracion) {
            res.status(403).send('Forbidden');
            return;
        }
        const config = (integracion.config ?? {}) as { appSecret?: string };
        const firma = req.headers['x-hub-signature-256'];
        const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
        if (!validarFirmaMeta(rawBody, typeof firma === 'string' ? firma : undefined, config.appSecret ? descifrarSecreto(config.appSecret) : undefined)) {
            logger.warn(`[meta-webhook] integración ${integracionId}: firma inválida o ausente`);
            res.status(403).send('Forbidden');
            return;
        }
        // 200 YA MISMO: Meta reintenta ante no-200 y corta webhooks lentos. El
        // procesamiento (fetch al Graph API + ingesta) sigue en background y
        // registra su resultado en ultimoEvento/ultimoError.
        res.status(200).send('EVENT_RECEIVED');
        void procesarNotificacionMeta(integracion, req.body).catch((err) => {
            logger.error(`[meta-webhook] integración ${integracionId}: procesamiento falló: ${err instanceof Error ? err.message : err}`);
        });
    } catch (error) {
        next(error);
    }
});

export default router;
