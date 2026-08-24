import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../../infrastructure/logging/logger';
import { env } from '../../config/env';
import prisma from '../../infrastructure/database/prisma';
import { withAuthBypass } from '../../infrastructure/database/unitOfWork';
import { cifrarSecreto, descifrarSecreto } from '../../infrastructure/security/secretBox';
import { limpiarCookieDeState, verificarStateOauthMl } from '../../infrastructure/security/mlOauthState';
import { conContextoSistema } from '../../application/services/consultaIngest';
import { canjearCodigo, exigirClaveDeCifradoMeli, obtenerUsuario } from '../../infrastructure/mercadolibre/meliClient';
import { procesarNotificacionMl } from '../../application/services/meliPreguntas';
import {
    buscarIntegracionMeta,
    resolverVerificacionMeta,
    validarFirmaMeta,
    procesarNotificacionMeta,
} from '../../infrastructure/integraciones/metaWebhook';

/**
 * Webhooks PÚBLICOS (sin JWT) — montados en app.ts FUERA del router /api (que
 * aplica authenticate global). La seguridad acá no es un token nuestro sino la
 * de cada canal: verify token en el handshake y firma HMAC del body en el POST
 * de Meta; el `state` firmado por nosotros MÁS la cookie del navegador que
 * arrancó el flujo, en el callback de Mercado Libre.
 *
 * El body CRUDO que exige la firma lo guarda el hook `verify` de express.json
 * en app.ts (req.rawBody, sólo para /api/webhooks).
 */

const router = Router();

/** Site del país con el que se da de alta una cuenta nueva (MLA = Argentina). */
const ML_SITE_POR_DEFECTO = process.env.ML_SITE_ID || 'MLA';

const mensajeCorto = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err)).slice(0, 200);

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

/**
 * @openapi
 * /webhooks/mercadolibre/callback:
 *   get:
 *     tags: [Webhooks]
 *     summary: Callback de OAuth de Mercado Libre (público)
 *     description: >
 *       Redirect URI de la app de Mercado Libre. Canjea el `code` por el par de
 *       tokens, deja la cuenta vinculada a la concesionaria que viaja firmada en
 *       el `state` y devuelve el navegador al panel. Responde SIEMPRE con un 302
 *       a `APP_URL/configuracion?ml=ok|error` — quien llega acá es el navegador
 *       del usuario, no un servidor. El `state` se valida contra la cookie
 *       httpOnly que dejó POST /mercadolibre/vincular (mismo navegador, un solo
 *       uso): sin esa cookie el callback no vincula nada.
 *     security: []
 *     parameters:
 *       - { name: code, in: query, schema: { type: string }, description: Código de autorización de un solo uso }
 *       - { name: state, in: query, schema: { type: string }, description: JWT con clave propia (typ + cid + sub + nonce, TTL 10 min), atado a la cookie del navegador }
 *     responses:
 *       302: { description: Redirect al panel con el resultado de la vinculación }
 */
router.get('/mercadolibre/callback', async (req: Request, res: Response) => {
    // Acá llega el NAVEGADOR del usuario: todo termina en un redirect al panel.
    // Un JSON de error lo dejaría mirando texto crudo en una pestaña de ML.
    const volverAlPanel = (params: string): void => {
        res.redirect(`${env.APP_URL}/configuracion?${params}`);
    };
    const conError = (detalle: string): void =>
        volverAlPanel(`ml=error&detalle=${encodeURIComponent(detalle)}`);

    try {
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        const state = typeof req.query.state === 'string' ? req.query.state : '';

        // El `state` dice a qué concesionaria pertenece este callback y viene de
        // vuelta por la barra del navegador: se verifica la firma Y el nonce
        // contra la cookie que dejó /vincular. La cookie es lo que ata el flujo
        // al navegador que lo arrancó: sin ella, cualquiera que consiga un state
        // válido (el suyo propio, mandado por phishing; o uno copiado de un log)
        // puede colgar la cuenta de Mercado Libre de otro en su tenant.
        // Se consume SIEMPRE, valide o no: un state no se puede usar dos veces.
        const payload = verificarStateOauthMl(req, state);
        limpiarCookieDeState(res);
        if (!payload) {
            // Vencido (TTL 10 min), manipulado, ausente, ya usado o abierto en
            // otro navegador. El motivo real NO se loguea ni se devuelve: el
            // state es material de autenticación y todos se arreglan igual.
            conError('El link de vinculación venció, ya se usó o se abrió en otro navegador. Volvé a intentarlo desde Configuración.');
            return;
        }
        const concesionariaId = payload.cid;

        // ML manda `error=access_denied` cuando el usuario cancela la pantalla de
        // autorización: sin code no hay nada que canjear.
        if (!code) {
            conError('Mercado Libre no devolvió el código de autorización (¿se canceló la vinculación?).');
            return;
        }

        // Antes de canjear: sin clave no se pueden guardar los tokens cifrados y
        // quedarían en claro en la base (ver exigirClaveDeCifradoMeli).
        exigirClaveDeCifradoMeli();

        const tokens = await canjearCodigo(code);
        const mlUserId = String(tokens.user_id);

        // La misma cuenta de Mercado Libre vinculada en dos concesionarias es
        // ambigua a propósito de más: el webhook resuelve el tenant por
        // `ml_user_id` (a ciegas, sin JWT) y el barrido del worker pide las
        // preguntas por vendedor, así que las consultas de los compradores
        // terminarían en el CRM del tenant equivocado. Se corta acá, que es el
        // único lugar donde se ven todos los tenants a la vez.
        const ajena = await withAuthBypass((tx) => tx.mercadoLibreCuenta.findFirst({
            where: { mlUserId, activa: true, deletedAt: null, concesionariaId: { not: concesionariaId } },
            select: { id: true },
        }));
        if (ajena) {
            conError('Esa cuenta de Mercado Libre ya está vinculada a otra concesionaria. Desvinculala de allá antes de conectarla acá.');
            return;
        }

        // Sin request autenticado no hay tenant en el contexto: el upsert corre
        // con el contexto sintético de la concesionaria del state para que la
        // extensión de Prisma inyecte el tenant y setee las GUC de RLS.
        await conContextoSistema(concesionariaId, async () => {
            const secretos = {
                accessToken: cifrarSecreto(tokens.access_token),
                refreshToken: cifrarSecreto(tokens.refresh_token),
                expiraEn: new Date(Date.now() + (tokens.expires_in ?? 21600) * 1000),
                activa: true,
                ultimoError: null,
            };
            const cuenta = await prisma.mercadoLibreCuenta.upsert({
                where: { concesionariaId_mlUserId: { concesionariaId, mlUserId } },
                create: { concesionariaId, mlUserId, siteId: ML_SITE_POR_DEFECTO, ...secretos },
                // `deletedAt: null` revive la fila: el unique [concesionariaId,
                // mlUserId] no distingue borrados, así que re-vincular después de
                // desvincular cae SIEMPRE en este update. Sin esto la cuenta
                // quedaba vinculada pero invisible para todo el resto del sistema.
                update: { ...secretos, deletedAt: null },
            });

            // Hoy se soporta UNA sola cuenta por concesionaria, pero el unique es
            // [concesionariaId, mlUserId]: autorizar con OTRO vendedor de ML creaba
            // una fila nueva y dejaba la vieja activa, con sus tokens vivos. La
            // pantalla mostraba una y el sistema publicaba con la otra, y
            // "Desvincular" no cortaba el acceso de la que quedaba. La vinculación
            // nueva REEMPLAZA a la anterior, explícito.
            await prisma.mercadoLibreCuenta.updateMany({
                where: { id: { not: cuenta.id }, activa: true },
                data: { activa: false, accessToken: '', refreshToken: '' },
            });

            // Best-effort: el vínculo ya es válido aunque /users/me falle; el
            // nickname es cosmético y el siteId se puede corregir después.
            try {
                const usuario = await obtenerUsuario(cuenta.id);
                await prisma.mercadoLibreCuenta.update({
                    where: { id: cuenta.id },
                    data: { nickname: usuario.nickname, siteId: usuario.site_id || cuenta.siteId },
                });
            } catch (err) {
                logger.warn(`[meli-oauth] cuenta ${cuenta.id}: no se pudo leer el perfil del vendedor: ${mensajeCorto(err)}`);
            }
        });

        // Se loguea la concesionaria y quién arrancó el flujo, nunca el code, el
        // state ni los tokens (el requestLogger tampoco: enmascara esos params).
        logger.info(`[meli-oauth] concesionaria ${concesionariaId}: cuenta de Mercado Libre vinculada (la inició el usuario ${payload.sub || '—'})`);
        volverAlPanel('ml=ok');
    } catch (err) {
        // Canje rechazado: code ya usado, code vencido (duran minutos) o la
        // Redirect URI de la app de ML distinta a la que mandamos. El detalle de
        // ML sirve para diagnosticar y no contiene secretos.
        const detalle = mensajeCorto(err);
        logger.error(`[meli-oauth] falló la vinculación: ${detalle}`);
        conError(detalle || 'No se pudo vincular la cuenta de Mercado Libre.');
    }
});

/**
 * @openapi
 * /webhooks/mercadolibre:
 *   post:
 *     tags: [Webhooks]
 *     summary: Notificaciones de Mercado Libre (público, sin firma)
 *     description: >
 *       Mercado Libre no firma el cuerpo: la validación es que el
 *       `application_id` sea el de nuestra app (obligatorio) y, ya con el
 *       recurso traído, que pertenezca al vendedor de la cuenta que resolvió la
 *       notificación. Se responde 200 SIEMPRE (incluso a una notificación ajena)
 *       y se procesa en background - ML corta a los pocos segundos y reintenta
 *       ante cualquier no-200.
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic: { type: string, example: questions }
 *               resource: { type: string, example: /questions/123456789 }
 *               user_id: { type: integer, description: Vendedor dueño del recurso }
 *               application_id: { type: integer }
 *               attempts: { type: integer }
 *               sent: { type: string, format: date-time }
 *               received: { type: string, format: date-time }
 *     responses:
 *       200: { description: Notificación recibida }
 */
router.post('/mercadolibre', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cuerpo = (req.body ?? {}) as {
            topic?: string;
            resource?: string;
            user_id?: number | string;
            application_id?: number | string;
        };

        // 200 ANTES de procesar: ML espera pocos segundos y reintenta ante
        // cualquier no-200 (con backoff creciente y hasta darse de baja del
        // webhook). Resolver la cuenta y traer la pregunta implica ir a la base y
        // a la API de ML: no entra en esa ventana. El resultado del procesamiento
        // se registra en el `ultimoError` de la cuenta.
        res.status(200).send('ok');

        // Mercado Libre NO firma el cuerpo, así que esto no es autenticación: es
        // sólo descartar ruido dirigido a otra app. Se responde 200 igual — un
        // 401 haría que ML reintente esta notificación ajena para siempre.
        // El application_id se EXIGE cuando la integración está configurada: con
        // `!= null` alcanzaba con omitir el campo para saltearse el filtro
        // entero, y ML siempre lo manda.
        const appId = process.env.ML_CLIENT_ID;
        if (appId && String(cuerpo.application_id ?? '') !== appId) {
            logger.warn(`[meli-webhook] notificación de otra aplicación (${cuerpo.application_id ?? 'sin application_id'}): ignorada`);
            return;
        }

        if (!cuerpo.topic || !cuerpo.resource || cuerpo.user_id == null) {
            logger.warn('[meli-webhook] notificación sin topic/resource/user_id: ignorada');
            return;
        }

        void procesarNotificacionMl({
            topic: cuerpo.topic,
            resource: cuerpo.resource,
            userId: String(cuerpo.user_id),
            applicationId: cuerpo.application_id != null ? String(cuerpo.application_id) : undefined,
        }).catch((err) => {
            logger.error(`[meli-webhook] procesamiento falló (${cuerpo.topic} ${cuerpo.resource}): ${mensajeCorto(err)}`);
        });
    } catch (error) {
        next(error);
    }
});

export default router;
