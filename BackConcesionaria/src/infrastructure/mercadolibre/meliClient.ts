import prisma from '../database/prisma';
import { cifrarSecreto, descifrarSecreto, hayClaveDeSecretos } from '../security/secretBox';
import { logger } from '../logging/logger';
import { BaseException } from '../../domain/exceptions/BaseException';

/**
 * Cliente de la API de Mercado Libre con OAuth y refresh transparente.
 *
 * Puntos del protocolo que condicionan este diseño:
 *  - El access token dura pocas horas; el refresh token es de UN SOLO USO: cada
 *    renovación devuelve un par nuevo y el anterior queda muerto. Si se pierde
 *    el refresh nuevo (p.ej. dos renovaciones en paralelo), la cuenta se
 *    desvincula y hay que re-autorizar a mano. Por eso el refresh está
 *    serializado por cuenta (un solo vuelo a la vez) y se persiste el par
 *    completo apenas llega.
 *  - Los tokens permiten publicar y responder EN NOMBRE del vendedor, así que
 *    se guardan cifrados en reposo (misma clave que las integraciones).
 *
 * Todo lo específico de la categoría (atributos obligatorios de autos) se
 * consulta a la API en runtime en vez de quedar fijo acá: si Mercado Libre
 * agrega un campo requerido, la publicación se adapta sin cambiar código.
 */

const API = 'https://api.mercadolibre.com';
/** El host de autorización es por país; MLA = Argentina. */
const AUTH_HOST: Record<string, string> = {
    MLA: 'https://auth.mercadolibre.com.ar',
    MLU: 'https://auth.mercadolibre.com.uy',
    MLC: 'https://auth.mercadolibre.cl',
};

/** Margen para renovar ANTES de que venza y no cortar una request en curso. */
const MARGEN_RENOVACION_MS = 10 * 60 * 1000;

export interface TokensMeli {
    access_token: string;
    refresh_token: string;
    /** Segundos de vida del access token. */
    expires_in: number;
    user_id: number | string;
    scope?: string;
}

/**
 * Status con el que un rechazo de Mercado Libre sale hacia NUESTRO cliente. No
 * se reenvía el de ML tal cual:
 *  - 401/403 de ML significa "el vínculo con la cuenta se rompió", no "tu sesión
 *    venció": devolver un 401 haría que el interceptor del front cierre la
 *    sesión del usuario por un problema que no es suyo.
 *  - Cualquier otra cosa (5xx de ML, errores de red) sale como 502: el que falló
 *    es el upstream, y contarlo como 500 propio ensucia el alerting del server.
 */
const statusHaciaElCliente = (status: number): number =>
    status === 400 || status === 404 || status === 409 || status === 422 || status === 429
        ? status
        : status === 401 || status === 403
            ? 409
            : 502;

/**
 * Rechazo de Mercado Libre. Extiende BaseException para que el errorHandler la
 * mapee a su status en vez del 500 genérico: el mensaje ya trae el `cause[]` de
 * ML concatenado (qué atributo falta al publicar, por qué rebotó la respuesta) y
 * ese detalle es justamente lo que el usuario necesita leer.
 *
 * `status` es el que devolvió ML (lo consultan los callers: un 404 al sincronizar
 * significa "el item ya no existe"); `statusCode` es con el que sale la respuesta
 * HTTP. El `cuerpo` NO viaja al cliente: el errorHandler sólo serializa
 * errorCode y message.
 */
export class MeliError extends BaseException {
    constructor(
        message: string,
        readonly status: number,
        readonly cuerpo?: unknown,
    ) {
        super(statusHaciaElCliente(status), message, 'MERCADOLIBRE_ERROR');
        this.name = 'MeliError';
    }
}

const clientId = () => process.env.ML_CLIENT_ID ?? '';
const clientSecret = () => process.env.ML_CLIENT_SECRET ?? '';
/**
 * Debe coincidir EXACTO con la Redirect URI cargada en la app de Mercado Libre.
 * El default apunta al callback PÚBLICO (/api/webhooks/...), que es el único que
 * ML puede alcanzar: todo lo que cuelga de /api/mercadolibre exige JWT, y el
 * navegador vuelve de ML sin sesión.
 */
const redirectUri = () =>
    process.env.ML_REDIRECT_URI ?? `${process.env.APP_URL ?? 'http://localhost:5173'}/api/webhooks/mercadolibre/callback`;

export const hayCredencialesMeli = (): boolean => !!clientId() && !!clientSecret();

/**
 * URL a la que se manda al usuario para que autorice la app.
 * `state` viaja de ida y vuelta: dice a qué concesionaria corresponde el
 * callback. Quién lo emite y cómo se ata al navegador que arrancó el flujo (que
 * es lo que corta el CSRF y el forced account linking) está en
 * infrastructure/security/mlOauthState.ts.
 */
export function urlDeAutorizacion(state: string, siteId = 'MLA'): string {
    const host = AUTH_HOST[siteId] ?? AUTH_HOST.MLA;
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId(),
        redirect_uri: redirectUri(),
        state,
    });
    return `${host}/authorization?${params.toString()}`;
}

async function pedirTokens(body: Record<string, string>): Promise<TokensMeli> {
    const res = await fetch(`${API}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(body).toString(),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
        const detalle = (json.message as string) || (json.error as string) || res.statusText;
        throw new MeliError(`Mercado Libre rechazó el token: ${detalle}`, res.status, json);
    }
    return json as unknown as TokensMeli;
}

/** Canjea el `code` del callback por el primer par de tokens. */
export const canjearCodigo = (code: string): Promise<TokensMeli> =>
    pedirTokens({
        grant_type: 'authorization_code',
        client_id: clientId(),
        client_secret: clientSecret(),
        code,
        redirect_uri: redirectUri(),
    });

/** Renueva con el refresh token (que se consume: devuelve uno nuevo). */
export const renovarTokens = (refreshToken: string): Promise<TokensMeli> =>
    pedirTokens({
        grant_type: 'refresh_token',
        client_id: clientId(),
        client_secret: clientSecret(),
        refresh_token: refreshToken,
    });

// Un refresh en vuelo por cuenta: dos renovaciones simultáneas queman el
// refresh token y desvinculan la cuenta.
const refrescosEnVuelo = new Map<number, Promise<string>>();

/**
 * Renovación SERIALIZADA por cuenta. Es el único punto del módulo que llama a
 * `renovarTokens`, y todos los caminos (vencimiento próximo y reintento por 401)
 * pasan por acá: el refresh token de ML es de un solo uso, así que dos
 * renovaciones en paralelo lo queman y dejan la cuenta desvinculada.
 *
 * La fila se lee DENTRO de la promesa, no antes de consultar el candado: si otro
 * vuelo acabó de renovar, lo que hay en base ya es el par nuevo y mandar el que
 * se leyó antes sería mandar uno consumido.
 *
 * `tokenQuemado` es el access token que acaba de recibir un 401: si la fila ya
 * tiene otro, es que alguien más renovó y no hay nada que renovar.
 */
async function refrescarTokens(cuentaId: number, tokenQuemado?: string): Promise<string> {
    const enVuelo = refrescosEnVuelo.get(cuentaId);
    if (enVuelo) return enVuelo;

    const promesa = (async () => {
        try {
            const cuenta = await prisma.mercadoLibreCuenta.findFirst({ where: { id: cuentaId } });
            if (!cuenta) throw new MeliError('La cuenta de Mercado Libre no existe', 404);
            const vigente = descifrarSecreto(cuenta.accessToken);
            // Otro vuelo ya renovó mientras esta llamada estaba en camino.
            if (tokenQuemado !== undefined && vigente !== tokenQuemado) return vigente;
            if (tokenQuemado === undefined && cuenta.expiraEn.getTime() - Date.now() >= MARGEN_RENOVACION_MS) {
                return vigente;
            }

            const tokens = await renovarTokens(descifrarSecreto(cuenta.refreshToken));
            await guardarTokens(cuentaId, tokens);
            logger.info(`[meli] tokens renovados para la cuenta ${cuentaId}`);
            return tokens.access_token;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Un refresh rechazado casi siempre significa vínculo roto: se marca
            // para que la UI pida re-autorizar en vez de reintentar en loop.
            await prisma.mercadoLibreCuenta.update({
                where: { id: cuentaId },
                data: { ultimoError: `No se pudo renovar la sesión: ${msg}`.slice(0, 300), activa: false },
            }).catch(() => undefined);
            throw err;
        } finally {
            refrescosEnVuelo.delete(cuentaId);
        }
    })();
    refrescosEnVuelo.set(cuentaId, promesa);
    return promesa;
}

/** Access token válido de la cuenta, renovando si está por vencer. */
export async function accessTokenVigente(cuentaId: number): Promise<string> {
    // El candado se consulta ANTES de leer la fila: si hay una renovación en
    // vuelo, la fila todavía tiene el `expiraEn` viejo y esta llamada dispararía
    // una segunda renovación con un refresh token que la primera ya consumió.
    const enVuelo = refrescosEnVuelo.get(cuentaId);
    if (enVuelo) return enVuelo;

    const cuenta = await prisma.mercadoLibreCuenta.findFirst({ where: { id: cuentaId } });
    if (!cuenta) throw new MeliError('La cuenta de Mercado Libre no existe', 404);
    if (!cuenta.activa) throw new MeliError('La cuenta de Mercado Libre está desactivada', 409);

    const vencePronto = cuenta.expiraEn.getTime() - Date.now() < MARGEN_RENOVACION_MS;
    if (!vencePronto) return descifrarSecreto(cuenta.accessToken);

    return refrescarTokens(cuentaId);
}

/**
 * Con estos tokens se publica, se CIERRA un aviso (irreversible en ML) y se
 * responde en nombre del vendedor: no se persisten nunca en claro.
 *
 * `cifrarSecreto` devuelve el valor tal cual cuando falta la clave — es la
 * retrocompatibilidad de las integraciones viejas (IMAP/Meta), que ya tenían
 * filas en texto plano. Mercado Libre nace después de esa clave, así que acá se
 * exige de forma explícita en vez de guardar en claro sin que nadie se entere:
 * la fila no distingue "cifrado" de "legado en claro" y la promesa del modelo
 * ("cifrados en reposo") quedaría siendo falsa en esa instalación.
 */
export function exigirClaveDeCifradoMeli(): void {
    if (!hayClaveDeSecretos()) {
        throw new MeliError(
            'Falta INTEGRACIONES_SECRET_KEY en el servidor: sin esa clave los tokens de Mercado Libre quedarían en texto plano en la base. Generala con `openssl rand -hex 32`, cargala en el .env del backend y reiniciá el proceso.',
            409,
        );
    }
}

/** Persiste el par de tokens (cifrado) y su vencimiento. */
export async function guardarTokens(cuentaId: number, tokens: TokensMeli): Promise<void> {
    exigirClaveDeCifradoMeli();
    await prisma.mercadoLibreCuenta.update({
        where: { id: cuentaId },
        data: {
            accessToken: cifrarSecreto(tokens.access_token),
            refreshToken: cifrarSecreto(tokens.refresh_token),
            expiraEn: new Date(Date.now() + (tokens.expires_in ?? 21600) * 1000),
            activa: true,
            ultimoError: null,
        },
    });
}

/**
 * Llamada autenticada a la API. Si vuelve 401 renueva UNA vez y reintenta:
 * cubre el caso de un token invalidado antes de su vencimiento nominal.
 */
export async function llamarApi<T>(
    cuentaId: number,
    ruta: string,
    init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
    const ejecutar = async (token: string): Promise<Response> => {
        const url = new URL(ruta.startsWith('http') ? ruta : `${API}${ruta}`);
        for (const [k, v] of Object.entries(init.query ?? {})) {
            if (v !== undefined) url.searchParams.set(k, String(v));
        }
        return fetch(url.toString(), {
            method: init.method ?? 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
    };

    const token = await accessTokenVigente(cuentaId);
    let res = await ejecutar(token);
    if (res.status === 401) {
        // La renovación va por el MISMO candado que accessTokenVigente: dos 401
        // concurrentes renovando en paralelo queman el refresh token (es de un
        // solo uso) y dejan la cuenta desvinculada, que es justo lo que el
        // candado existe para evitar.
        const renovado = await refrescarTokens(cuentaId, token);
        res = await ejecutar(renovado);
    }

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
        // El detalle de ML suele venir en `message` + `cause[]`: se concatena
        // porque ahí aparece qué atributo falta al publicar.
        const causas = Array.isArray(json.cause)
            ? (json.cause as Array<Record<string, unknown>>).map((c) => c.message ?? c.code).filter(Boolean).join('; ')
            : '';
        const detalle = [json.message ?? res.statusText, causas].filter(Boolean).join(' — ');
        throw new MeliError(String(detalle), res.status, json);
    }
    return json as T;
}

/** Datos del vendedor autenticado (para mostrar el nickname al vincular). */
export const obtenerUsuario = (cuentaId: number) =>
    llamarApi<{ id: number; nickname: string; site_id: string }>(cuentaId, '/users/me');

/**
 * Sugiere la categoría a partir del texto del vehículo (marca modelo año).
 * Se usa el predictor en vez de hardcodear el id: las categorías cambian y
 * varían por país.
 */
export async function sugerirCategoria(cuentaId: number, texto: string, siteId = 'MLA'): Promise<string | null> {
    const r = await llamarApi<Array<{ category_id: string }>>(
        cuentaId,
        `/sites/${siteId}/domain_discovery/search`,
        { query: { q: texto, limit: 1 } },
    );
    return Array.isArray(r) && r[0]?.category_id ? r[0].category_id : null;
}

export interface AtributoCategoria {
    id: string;
    name: string;
    tags?: Record<string, boolean>;
    value_type?: string;
    values?: Array<{ id: string; name: string }>;
}

/** Atributos de la categoría; de acá salen los OBLIGATORIOS en runtime. */
export const atributosDeCategoria = (cuentaId: number, categoriaId: string) =>
    llamarApi<AtributoCategoria[]>(cuentaId, `/categories/${categoriaId}/attributes`);

export const esAtributoRequerido = (a: AtributoCategoria): boolean =>
    !!(a.tags?.required || a.tags?.catalog_required);
