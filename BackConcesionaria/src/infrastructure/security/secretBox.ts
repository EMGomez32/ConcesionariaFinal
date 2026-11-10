import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * Cifrado en reposo de los secretos que la app necesita LEER de vuelta (no alcanza con un
 * hash): el secreto TOTP de cada usuario, los de las integraciones (appSecret y tokens de
 * Meta, pass IMAP) y los tokens OAuth de Mercado Libre. AES-256-GCM con las claves de
 * INTEGRACIONES_SECRET_KEY (64 hex = 32 bytes; generarla EN el servidor con
 * `openssl rand -hex 32`, nunca sale de ahí).
 *
 * ── FORMATOS EN REPOSO ────────────────────────────────────────────────────────────────
 *   enc:v2:<kid>:<iv_b64>:<tag_b64>:<ct_b64>   ← lo único que se escribe
 *   enc:v1:<iv_b64>:<tag_b64>:<ct_b64>         ← sólo lectura (sin AAD ni kid)
 *   cualquier otra cosa                         ← texto plano LEGADO (sólo lectura)
 *
 * v2 resuelve los dos huecos de v1:
 *  1. AAD (datos asociados autenticados). Cada valor queda atado a DÓNDE vive con un
 *     contexto `<tabla>:<id>:<campo>` (ver `contextoSecreto`): el tag de GCM cubre ese
 *     texto, así que un blob copiado a otra fila u otro campo —el token de Meta de una
 *     concesionaria pegado en la integración de otra, el secreto TOTP de un admin pegado en
 *     la fila de otro usuario— ya no descifra: falla, en vez de entregar el secreto ajeno.
 *     Lo autenticado es `enc:v2|<contexto>`: el prefijo de versión separa este uso de la
 *     clave de cualquier formato futuro que use la misma clave con otro AAD.
 *  2. Rotación. `kid` = primeros 8 hex del SHA-256 de la clave (identifica, no revela: es
 *     un hash de 32 bytes aleatorios). Con él se sabe con qué clave se cifró cada valor:
 *     INTEGRACIONES_SECRET_KEY es la ACTUAL (con la que se cifra) e
 *     INTEGRACIONES_SECRET_KEYS_ANTERIORES las que sólo sirven para leer lo viejo hasta que
 *     `npm run recifrar-secretos -- --apply` lo pase a la actual. Procedimiento completo en
 *     docs/seguridad/criptografia-y-secretos.md.
 *
 * v1 no trae kid: se prueba con la actual y después con cada anterior (el tag de GCM hace
 * que una clave equivocada falle, no que devuelva basura). Tampoco trae AAD, así que un v1
 * copiado de otra fila SÍ descifra: es la deuda que se cierra corriendo el re-cifrado, que
 * pasa todo a v2. Por eso el script lista cuántos v1 quedan.
 *
 * ── MIGRACIÓN PEREZOSA ────────────────────────────────────────────────────────────────
 * Leer un v1, un v2 de una clave anterior o un texto plano NO reescribe la fila: los caminos
 * de lectura (login con 2FA, webhook de Meta, worker IMAP) no escriben, para no meter
 * escrituras concurrentes donde hoy no las hay. Se pasa a v2 con la clave actual cuando el
 * valor se VUELVE A GUARDAR (`cifrarSecreto` recibe un sobre viejo → lo re-cifra) o con el
 * script, que es lo que deja todo parejo.
 *
 * ── FALLAR CERRADO ────────────────────────────────────────────────────────────────────
 * Un sobre (v1/v2) que no se puede abrir —falta la clave, AAD o clave equivocada, blob
 * manipulado— tira `SecretoIlegibleError`. Nunca se devuelve el blob como si fuera el
 * secreto: mandarle a Meta/IMAP/ML el texto cifrado, o verificar un TOTP contra él, es
 * peor que un error explícito.
 *
 * Sin clave (sólo desarrollo/test: en producción env.ts no deja arrancar), se escribe en
 * claro y se avisa al arranque (server.ts).
 */

const PREFIJO_V1 = 'enc:v1:';
const PREFIJO_V2 = 'enc:v2:';
/** Cualquier `enc:v<n>:`. Una versión que este código no conoce es un sobre ilegible, NUNCA texto plano. */
const SOBRE = /^enc:v\d+:/;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const KID = /^[0-9a-f]{8}$/;

/**
 * Campos del config Json de una integración que son secretos y viajan cifrados en reposo.
 *
 * ÚNICA fuente de verdad: integracion.schema.ts la RE-EXPORTA (antes tenía una
 * copia propia) porque el controller usa la misma lista para enmascarar en las
 * respuestas y para el merge "vacío = conservar el guardado". Si las dos listas
 * divergen, el bug es silencioso: cifrado-pero-no-enmascarado devuelve el blob
 * `enc:...` por la API, y enmascarado-pero-no-cifrado deja el token EN CLARO
 * en Postgres.
 *
 * Un token de acceso de Meta (pageAccessToken / instagramAccessToken) permite
 * publicar y mensajear EN NOMBRE de la concesionaria: van cifrados sí o sí.
 * Los ids (pageId, igBusinessAccountId) NO son secretos —son públicos y la
 * pantalla los tiene que poder mostrar—, así que no van en esta lista.
 */
export const CAMPOS_SECRETOS = ['appSecret', 'pageAccessToken', 'instagramAccessToken', 'pass'] as const;
export type CampoSecretoIntegracion = (typeof CAMPOS_SECRETOS)[number];

// ── Contexto (AAD) ───────────────────────────────────────────────────────────────────

declare const marcaContexto: unique symbol;
/**
 * Contexto que se autentica como AAD. Tipo "marcado": sólo lo fabrican los constructores de
 * `contextoSecreto`, así que ningún llamador puede inventarse un formato propio (o pasar
 * un string cualquiera) y el esquema queda parejo en todo el sistema.
 */
export type ContextoSecreto = string & { readonly [marcaContexto]: true };

/**
 * Esquema ÚNICO de contextos: `<tabla>:<id>:<campo>`, con la tabla y la columna tal como
 * están en Postgres (para que el script de re-cifrado y quien lea un error sepan exactamente
 * qué fila es) y, para un campo dentro de un Json, `config.<clave>`:
 *   usuarios:<id>:totp_secret
 *   integraciones_canal:<id>:config.<appSecret|pageAccessToken|instagramAccessToken|pass>
 *   mercadolibre_cuentas:<id>:<access_token|refresh_token>
 *
 * El id es el de la fila: es lo único estable y único. Cuando todavía no existe (un alta),
 * el llamador inserta primero SIN el secreto y lo cifra con el id ya asignado, en la misma
 * transacción (ver IntegracionController.create y el callback de Mercado Libre).
 */
export const contextoSecreto = {
    totpUsuario: (usuarioId: number) => armarContexto('usuarios', usuarioId, 'totp_secret'),
    integracion: (integracionId: number, campo: CampoSecretoIntegracion) =>
        armarContexto('integraciones_canal', integracionId, `config.${campo}`),
    cuentaMl: (cuentaId: number, campo: 'access_token' | 'refresh_token') =>
        armarContexto('mercadolibre_cuentas', cuentaId, campo),
};

function armarContexto(tabla: string, id: number, campo: string): ContextoSecreto {
    // Un id que no es un entero positivo (undefined, NaN, 0 de un objeto a medio armar) daría
    // el MISMO contexto para filas distintas —"usuarios:NaN:totp_secret"— y el AAD dejaría
    // de distinguirlas. Mejor cortar acá.
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error(`Contexto de cifrado inválido: el id de ${tabla} tiene que ser un entero positivo`);
    }
    return `${tabla}:${id}:${campo}` as ContextoSecreto;
}

const aadV2 = (contexto: ContextoSecreto): Buffer => Buffer.from(`enc:v2|${contexto}`, 'utf8');

// ── Claves ───────────────────────────────────────────────────────────────────────────

interface Clave {
    kid: string;
    bytes: Buffer;
}

/** kid = primeros 8 hex del SHA-256 de los 32 bytes de la clave. */
export function kidDeClave(hex: string): string {
    return crypto.createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex').slice(0, 8);
}

function armarClave(hex: string): Clave {
    const bytes = Buffer.from(hex, 'hex');
    // env.ts ya valida los 64 hex; esto es la red por si alguien arma el env a mano.
    if (bytes.length !== 32) throw new Error('Clave de cifrado de secretos inválida: tiene que ser de 32 bytes (64 hex)');
    return { kid: kidDeClave(hex), bytes };
}

/**
 * Anillo de claves: la actual primero (es la única con la que se cifra) y después las
 * anteriores, sin repetidas. Se arma en cada uso a partir del env (son microsegundos) para
 * no cachear material de clave en otro lugar más.
 */
function anillo(): { actual: Clave | null; todas: Clave[] } {
    const actualHex = env.INTEGRACIONES_SECRET_KEY;
    const actual = actualHex ? armarClave(actualHex) : null;
    const todas: Clave[] = actual ? [actual] : [];
    for (const hex of env.INTEGRACIONES_SECRET_KEYS_ANTERIORES ?? []) {
        const c = armarClave(hex);
        const mismoKid = todas.find((t) => t.kid === c.kid);
        if (!mismoKid) {
            todas.push(c);
        } else if (!mismoKid.bytes.equals(c.bytes)) {
            // Dos claves DISTINTAS con el mismo kid (probabilidad ~2^-32): el kid ya no
            // identificaría la clave. Cortar y que se genere otra antes que adivinar.
            throw new Error(`Dos claves de cifrado distintas comparten el kid ${c.kid}: generá una clave nueva (openssl rand -hex 32)`);
        }
        // Repetida (p. ej. la actual también listada en ANTERIORES): se ignora.
    }
    return { actual, todas };
}

export const hayClaveDeSecretos = (): boolean => !!env.INTEGRACIONES_SECRET_KEY;

/** kids configurados (no son secretos): para el log de arranque y el script de re-cifrado. */
export function kidsDeClaves(): { actual: string | null; anteriores: string[] } {
    const { actual, todas } = anillo();
    return { actual: actual?.kid ?? null, anteriores: todas.filter((c) => c !== actual).map((c) => c.kid) };
}

// ── Errores ──────────────────────────────────────────────────────────────────────────

export type MotivoSecretoIlegible = 'sin_clave' | 'kid_desconocido' | 'no_autentica' | 'formato' | 'version_desconocida';

/**
 * Un sobre que no se puede abrir. El mensaje dice el contexto (tabla:id:campo) y el kid,
 * que no son secretos y son justo lo que hace falta para diagnosticar; nunca el valor.
 */
export class SecretoIlegibleError extends Error {
    constructor(
        public readonly motivo: MotivoSecretoIlegible,
        public readonly contexto: string,
        detalle: string,
    ) {
        super(`No se pudo descifrar el secreto de ${contexto}: ${detalle}`);
        this.name = 'SecretoIlegibleError';
    }
}

// ── Inspección ───────────────────────────────────────────────────────────────────────

export type EstadoSecreto =
    | { version: 'vacio' }
    | { version: 'claro' }
    | { version: 'v1' }
    | { version: 'v2'; kid: string; vigente: boolean }
    | { version: 'desconocida' };

/** Un sobre de cualquier versión (v1, v2 o una que este código no conoce). */
export const estaCifrado = (valor: unknown): boolean => typeof valor === 'string' && SOBRE.test(valor);

/** Qué hay guardado, sin descifrar nada (para el script de re-cifrado y los diagnósticos). */
export function inspeccionarSecreto(valor: string | null | undefined): EstadoSecreto {
    if (!valor) return { version: 'vacio' };
    if (!estaCifrado(valor)) return { version: 'claro' };
    if (valor.startsWith(PREFIJO_V1)) return { version: 'v1' };
    if (valor.startsWith(PREFIJO_V2)) {
        const kid = valor.slice(PREFIJO_V2.length).split(':')[0];
        return { version: 'v2', kid, vigente: kid === kidsDeClaves().actual };
    }
    return { version: 'desconocida' };
}

/** ¿Hay que pasarlo a v2 con la clave actual? (texto plano, v1 o v2 de una clave anterior) */
export function necesitaRecifrado(valor: string | null | undefined): boolean {
    const e = inspeccionarSecreto(valor);
    return e.version === 'claro' || e.version === 'v1' || (e.version === 'v2' && !e.vigente);
}

// ── Cifrar / descifrar ───────────────────────────────────────────────────────────────

function sellarV2(plano: string, clave: Clave, contexto: ContextoSecreto): string {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', clave.bytes, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(aadV2(contexto));
    const ct = Buffer.concat([cipher.update(plano, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIJO_V2}${clave.kid}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Decodifica las tres partes binarias de un sobre, con los largos exactos (nada de base64 "laxo"). */
function partes(contexto: string, iv: string | undefined, tag: string | undefined, ct: string | undefined) {
    if (iv === undefined || tag === undefined || ct === undefined || ![iv, tag, ct].every((p) => B64.test(p))) {
        throw new SecretoIlegibleError('formato', contexto, 'el valor cifrado está mal formado');
    }
    const ivB = Buffer.from(iv, 'base64');
    const tagB = Buffer.from(tag, 'base64');
    // El tag se exige de 16 bytes: GCM acepta tags truncados (hasta 4 bytes) si no se fija
    // el largo, y un tag corto se puede forzar.
    if (ivB.length !== IV_BYTES || tagB.length !== TAG_BYTES) {
        throw new SecretoIlegibleError('formato', contexto, 'el valor cifrado está mal formado');
    }
    return { iv: ivB, tag: tagB, ct: Buffer.from(ct, 'base64') };
}

function abrirGcm(clave: Buffer, p: { iv: Buffer; tag: Buffer; ct: Buffer }, aad: Buffer | null): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', clave, p.iv, { authTagLength: TAG_BYTES });
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(p.tag);
    return Buffer.concat([decipher.update(p.ct), decipher.final()]).toString('utf8');
}

/**
 * Descifra un valor guardado en su contexto. El texto plano legado pasa tal cual; un sobre
 * que no autentica (contexto o clave equivocados, manipulado) tira `SecretoIlegibleError`.
 */
export function descifrarSecreto(valor: string, contexto: ContextoSecreto): string {
    if (!estaCifrado(valor)) return valor;
    const { actual, todas } = anillo();
    if (todas.length === 0) {
        throw new SecretoIlegibleError('sin_clave', contexto, 'hay secretos cifrados pero falta INTEGRACIONES_SECRET_KEY');
    }

    if (valor.startsWith(PREFIJO_V2)) {
        const [kid, iv, tag, ct, ...sobra] = valor.slice(PREFIJO_V2.length).split(':');
        if (!KID.test(kid ?? '') || sobra.length > 0) {
            throw new SecretoIlegibleError('formato', contexto, 'el valor cifrado está mal formado');
        }
        const p = partes(contexto, iv, tag, ct);
        const clave = todas.find((c) => c.kid === kid);
        if (!clave) {
            throw new SecretoIlegibleError(
                'kid_desconocido',
                contexto,
                `está cifrado con la clave ${kid}, que no es la actual (${actual?.kid ?? 'ninguna'}) ni está en INTEGRACIONES_SECRET_KEYS_ANTERIORES`,
            );
        }
        try {
            return abrirGcm(clave.bytes, p, aadV2(contexto));
        } catch {
            throw new SecretoIlegibleError(
                'no_autentica',
                contexto,
                `no autentica con la clave ${kid}: el valor no pertenece a este lugar (fue copiado de otra fila o campo) o fue modificado`,
            );
        }
    }

    if (valor.startsWith(PREFIJO_V1)) {
        const [iv, tag, ct, ...sobra] = valor.slice(PREFIJO_V1.length).split(':');
        if (sobra.length > 0) throw new SecretoIlegibleError('formato', contexto, 'el valor cifrado está mal formado');
        const p = partes(contexto, iv, tag, ct);
        for (const clave of todas) {
            try {
                return abrirGcm(clave.bytes, p, null);
            } catch {
                // Con otra clave el tag no cierra: se prueba la siguiente.
            }
        }
        throw new SecretoIlegibleError(
            'no_autentica',
            contexto,
            'formato v1: no abre con la clave actual ni con ninguna de INTEGRACIONES_SECRET_KEYS_ANTERIORES',
        );
    }

    throw new SecretoIlegibleError('version_desconocida', contexto, 'versión de cifrado desconocida');
}

/**
 * Cifra para guardar: SIEMPRE sale v2 con la clave actual y el AAD de `contexto`.
 * Sin clave configurada (sólo desarrollo/test), devuelve el valor tal cual (modo claro).
 *
 * Si lo que llega ya es un sobre (un secreto guardado que se conserva al editar la
 * integración), se RE-CIFRA en vez de devolverlo igual: así un v1 o un v2 de una clave
 * anterior sale al día al volver a guardarse (la migración perezosa). Y como para
 * re-cifrarlo primero hay que abrirlo en ESTE contexto, un v2 traído de otra fila falla acá
 * en vez de quedar guardado como propio.
 */
export function cifrarSecreto(plano: string, contexto: ContextoSecreto): string {
    if (!plano) return plano;
    const { actual } = anillo();
    if (!actual) {
        // Modo claro: un sobre se deja como está (no hay con qué re-cifrarlo) y descifrarlo
        // va a fallar cerrado con el motivo; el texto plano queda en claro, como antes.
        return plano;
    }
    if (estaCifrado(plano)) {
        const e = inspeccionarSecreto(plano);
        // Ya está al día: se verifica que abra en ESTE contexto y se deja igual (idempotente,
        // sin reescribir el IV en cada guardado).
        if (e.version === 'v2' && e.vigente) {
            descifrarSecreto(plano, contexto);
            return plano;
        }
        return sellarV2(descifrarSecreto(plano, contexto), actual, contexto);
    }
    return sellarV2(plano, actual, contexto);
}

/**
 * Cifra los campos secretos de la config de la integración `integracionId` (el resto queda
 * igual). Cada campo con su propio contexto: el appSecret no se puede mover al lugar del
 * pageAccessToken ni a la misma clave de otra integración.
 */
export function cifrarConfig(config: Record<string, unknown>, integracionId: number): Record<string, unknown> {
    const out = { ...config };
    for (const campo of CAMPOS_SECRETOS) {
        const v = out[campo];
        if (typeof v === 'string' && v) out[campo] = cifrarSecreto(v, contextoSecreto.integracion(integracionId, campo));
    }
    return out;
}

/** La config sin sus campos secretos: lo que se inserta en un alta antes de tener el id (ver el AAD). */
export function configSinSecretos(config: Record<string, unknown>): Record<string, unknown> {
    const out = { ...config };
    for (const campo of CAMPOS_SECRETOS) delete out[campo];
    return out;
}
