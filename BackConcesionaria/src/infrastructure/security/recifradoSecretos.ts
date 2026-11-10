import { Prisma, PrismaClient } from '@prisma/client';
import {
    CAMPOS_SECRETOS,
    ContextoSecreto,
    EstadoSecreto,
    MotivoSecretoIlegible,
    SecretoIlegibleError,
    cifrarSecreto,
    contextoSecreto,
    descifrarSecreto,
    inspeccionarSecreto,
    kidsDeClaves,
    necesitaRecifrado,
} from './secretBox';

/**
 * Re-cifrado de TODOS los secretos en reposo a v2 con la clave actual (lo corre
 * `npm run recifrar-secretos`, ver prisma/recifrar-secretos.ts). Es lo que cierra una
 * rotación de clave —después de esto la clave vieja ya no hace falta— y lo que termina con
 * los v1 (sin AAD) y el texto plano legado, que la migración perezosa sólo va pasando a v2
 * a medida que cada fila se vuelve a guardar.
 *
 * Dónde hay secretos (si se agrega uno, va acá Y en el contexto de secretBox):
 *   usuarios.totp_secret                                   → usuarios:<id>:totp_secret
 *   integraciones_canal.config.{appSecret,pageAccessToken,  → integraciones_canal:<id>:config.<campo>
 *                               instagramAccessToken,pass}
 *   mercadolibre_cuentas.{access_token,refresh_token}      → mercadolibre_cuentas:<id>:<columna>
 *
 * Reglas:
 *  - NUNCA se imprime ni se devuelve en un mensaje un valor (ni en claro ni cifrado): sólo
 *    contextos (tabla:id:campo), versiones, kids y cantidades. Los errores de Prisma tampoco
 *    se imprimen tal cual: su mensaje puede traer los argumentos de la consulta, es decir, el
 *    secreto (ver `motivoSeguro`).
 *  - Se recorren TODAS las filas, también las dadas de baja: un secreto en una fila borrada
 *    lógicamente sigue estando en la base (y en los backups).
 *  - Cada escritura es condicional al valor leído (`updateMany` con el valor viejo en el
 *    where): si la app lo cambió mientras corría el script (p. ej. renovó los tokens de
 *    Mercado Libre), no se pisa; queda contado como "cambió durante la corrida" y la
 *    próxima corrida lo ve ya en v2.
 *  - `updatedAt` se conserva: re-cifrar no es una edición del usuario.
 *  - Idempotente: lo que ya está en v2 con la clave actual no se toca.
 */

export type TablaSecreto = 'usuarios' | 'integraciones_canal' | 'mercadolibre_cuentas';

export interface ItemSecreto {
    tabla: TablaSecreto;
    id: number;
    /** Columna, o `config.<clave>` para un campo del Json. */
    campo: string;
    contexto: ContextoSecreto;
    estado: EstadoSecreto;
    /** null = se puede abrir (o es texto plano); si no, por qué no. */
    ilegible: MotivoSecretoIlegible | null;
    recifrar: boolean;
}

interface FilaUsuario { id: number; totpSecret: string | null; updatedAt: Date }
interface FilaIntegracion { id: number; config: Prisma.JsonValue; updatedAt: Date }
interface FilaCuentaMl { id: number; accessToken: string; refreshToken: string; updatedAt: Date }

export interface PlanRecifrado {
    kids: { actual: string | null; anteriores: string[] };
    items: ItemSecreto[];
    /** Cuentas de ML en modo demo: guardan un centinela, no un token; no se cuentan ni se tocan. */
    cuentasDemoSalteadas: number;
    filas: { usuarios: FilaUsuario[]; integraciones: FilaIntegracion[]; cuentasMl: FilaCuentaMl[] };
}

export interface ResultadoRecifrado {
    recifrados: number;
    cambiaronDuranteLaCorrida: number;
    errores: string[];
}

/** Lo que se puede decir de un error sin riesgo de filtrar un valor. */
export function motivoSeguro(err: unknown): string {
    if (err instanceof SecretoIlegibleError) return err.message;
    const codigo = (err as { code?: unknown })?.code;
    const nombre = err instanceof Error ? err.name : 'Error';
    return typeof codigo === 'string' ? `${nombre} (${codigo})` : nombre;
}

function evaluar(tabla: TablaSecreto, id: number, campo: string, contexto: ContextoSecreto, valor: string): ItemSecreto {
    const estado = inspeccionarSecreto(valor);
    let ilegible: MotivoSecretoIlegible | null = null;
    try {
        descifrarSecreto(valor, contexto);
    } catch (err) {
        if (!(err instanceof SecretoIlegibleError)) throw err;
        ilegible = err.motivo;
    }
    return { tabla, id, campo, contexto, estado, ilegible, recifrar: ilegible === null && necesitaRecifrado(valor) };
}

const comoConfig = (config: Prisma.JsonValue): Record<string, unknown> =>
    config && typeof config === 'object' && !Array.isArray(config) ? (config as Record<string, unknown>) : {};

/** Lee todo y clasifica. No escribe nada (es la simulación, y el primer paso de `--apply`). */
export async function planificarRecifrado(db: PrismaClient): Promise<PlanRecifrado> {
    const items: ItemSecreto[] = [];

    const usuarios = await db.usuario.findMany({
        where: { totpSecret: { not: null } },
        select: { id: true, totpSecret: true, updatedAt: true },
        orderBy: { id: 'asc' },
    });
    for (const u of usuarios) {
        if (!u.totpSecret) continue;
        items.push(evaluar('usuarios', u.id, 'totp_secret', contextoSecreto.totpUsuario(u.id), u.totpSecret));
    }

    const integraciones = await db.integracionCanal.findMany({
        select: { id: true, config: true, updatedAt: true },
        orderBy: { id: 'asc' },
    });
    for (const i of integraciones) {
        const config = comoConfig(i.config);
        for (const campo of CAMPOS_SECRETOS) {
            const v = config[campo];
            if (typeof v !== 'string' || !v) continue;
            items.push(evaluar('integraciones_canal', i.id, `config.${campo}`, contextoSecreto.integracion(i.id, campo), v));
        }
    }

    const cuentas = await db.mercadoLibreCuenta.findMany({
        select: { id: true, accessToken: true, refreshToken: true, updatedAt: true, modo: true },
        orderBy: { id: 'asc' },
    });
    let cuentasDemoSalteadas = 0;
    const cuentasMl: FilaCuentaMl[] = [];
    for (const c of cuentas) {
        if (c.modo === 'demo') {
            cuentasDemoSalteadas += 1;
            continue;
        }
        cuentasMl.push(c);
        if (c.accessToken) items.push(evaluar('mercadolibre_cuentas', c.id, 'access_token', contextoSecreto.cuentaMl(c.id, 'access_token'), c.accessToken));
        if (c.refreshToken) items.push(evaluar('mercadolibre_cuentas', c.id, 'refresh_token', contextoSecreto.cuentaMl(c.id, 'refresh_token'), c.refreshToken));
    }

    return {
        kids: kidsDeClaves(),
        items,
        cuentasDemoSalteadas,
        filas: { usuarios, integraciones, cuentasMl },
    };
}

/** Re-cifra un valor y comprueba, ANTES de escribirlo, que el nuevo abre y da lo mismo que el viejo. */
function recifrarVerificado(valor: string, contexto: ContextoSecreto): string {
    const nuevo = cifrarSecreto(valor, contexto);
    if (descifrarSecreto(nuevo, contexto) !== descifrarSecreto(valor, contexto)) {
        throw new Error(`El re-cifrado de ${contexto} no verificó: no se escribe`);
    }
    return nuevo;
}

/** Aplica el plan: pasa a v2 con la clave actual cada item legible que lo necesite. */
export async function aplicarRecifrado(db: PrismaClient, plan: PlanRecifrado): Promise<ResultadoRecifrado> {
    if (!plan.kids.actual) throw new Error('Sin INTEGRACIONES_SECRET_KEY no hay con qué cifrar');
    const r: ResultadoRecifrado = { recifrados: 0, cambiaronDuranteLaCorrida: 0, errores: [] };
    const pendientes = (tabla: TablaSecreto, id: number) => plan.items.filter((i) => i.tabla === tabla && i.id === id && i.recifrar);

    const contar = (count: number, n: number) => {
        if (count === 1) r.recifrados += n;
        else r.cambiaronDuranteLaCorrida += n;
    };

    for (const u of plan.filas.usuarios) {
        const [item] = pendientes('usuarios', u.id);
        if (!item || !u.totpSecret) continue;
        try {
            const nuevo = recifrarVerificado(u.totpSecret, item.contexto);
            const { count } = await db.usuario.updateMany({
                where: { id: u.id, totpSecret: u.totpSecret },
                data: { totpSecret: nuevo, updatedAt: u.updatedAt },
            });
            contar(count, 1);
        } catch (err) {
            r.errores.push(`${item.contexto}: ${motivoSeguro(err)}`);
        }
    }

    for (const i of plan.filas.integraciones) {
        const items = pendientes('integraciones_canal', i.id);
        if (items.length === 0) continue;
        try {
            const viejo = comoConfig(i.config);
            const nuevo: Record<string, unknown> = { ...viejo };
            for (const item of items) {
                const campo = item.campo.slice('config.'.length);
                nuevo[campo] = recifrarVerificado(String(viejo[campo]), item.contexto);
            }
            // El where compara el Json entero (igualdad de jsonb): si la integración se editó
            // mientras corría el script, no se pisa la edición.
            const { count } = await db.integracionCanal.updateMany({
                where: { id: i.id, config: { equals: i.config as Prisma.InputJsonValue } },
                data: { config: nuevo as Prisma.InputJsonValue, updatedAt: i.updatedAt },
            });
            contar(count, items.length);
        } catch (err) {
            r.errores.push(`integraciones_canal:${i.id}: ${motivoSeguro(err)}`);
        }
    }

    for (const c of plan.filas.cuentasMl) {
        const items = pendientes('mercadolibre_cuentas', c.id);
        if (items.length === 0) continue;
        try {
            const data: { accessToken?: string; refreshToken?: string; updatedAt: Date } = { updatedAt: c.updatedAt };
            for (const item of items) {
                if (item.campo === 'access_token') data.accessToken = recifrarVerificado(c.accessToken, item.contexto);
                else data.refreshToken = recifrarVerificado(c.refreshToken, item.contexto);
            }
            // Los DOS tokens en el where: la app renueva el par junto, y si renovó en el medio
            // el par nuevo ya salió en v2; pisarlo con el viejo re-cifrado desvincularía la cuenta.
            const { count } = await db.mercadoLibreCuenta.updateMany({
                where: { id: c.id, accessToken: c.accessToken, refreshToken: c.refreshToken },
                data,
            });
            contar(count, items.length);
        } catch (err) {
            r.errores.push(`mercadolibre_cuentas:${c.id}: ${motivoSeguro(err)}`);
        }
    }

    // Constancia de PLATAFORMA (como la retención): qué se re-cifró, con qué clave, sin valores.
    await db.securityEvent.create({
        data: {
            accion: 'recifrado_secretos',
            entidad: 'Secretos',
            detalle: (
                `Re-cifrado de secretos aplicado con la clave ${plan.kids.actual}`
                + `${plan.kids.anteriores.length ? ` (anteriores configuradas: ${plan.kids.anteriores.join(', ')})` : ''}. `
                + `Re-cifrados: ${r.recifrados}; cambiaron durante la corrida: ${r.cambiaronDuranteLaCorrida}; `
                + `ilegibles: ${plan.items.filter((i) => i.ilegible).length}; errores: ${r.errores.length}.`
            ).slice(0, 1000),
        },
    });

    return r;
}

// ── Resumen para la consola ──────────────────────────────────────────────────────────

const etiquetaVersion = (e: EstadoSecreto, actual: string | null): string => {
    switch (e.version) {
        case 'v2': return e.kid === actual ? `v2 clave actual (${e.kid})` : `v2 clave anterior (${e.kid})`;
        case 'v1': return 'v1 (sin AAD)';
        case 'claro': return 'en claro (legado)';
        case 'desconocida': return 'versión desconocida';
        default: return 'vacío';
    }
};

/**
 * Líneas para imprimir: cantidades por lugar y versión/kid, y los ilegibles con su contexto
 * (tabla:id:campo) y motivo. Ningún valor.
 */
export function resumirPlan(plan: PlanRecifrado): string[] {
    const lineas: string[] = [];
    const lugares = new Map<string, Map<string, number>>();
    for (const item of plan.items) {
        const lugar = `${item.tabla}.${item.campo}`;
        const porVersion = lugares.get(lugar) ?? new Map<string, number>();
        const etiqueta = etiquetaVersion(item.estado, plan.kids.actual);
        porVersion.set(etiqueta, (porVersion.get(etiqueta) ?? 0) + 1);
        lugares.set(lugar, porVersion);
    }
    if (lugares.size === 0) lineas.push('no hay secretos guardados');
    for (const [lugar, porVersion] of [...lugares.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const total = [...porVersion.values()].reduce((a, b) => a + b, 0);
        const detalle = [...porVersion.entries()].map(([v, n]) => `${v}: ${n}`).join(' · ');
        lineas.push(`${lugar}: ${total} (${detalle})`);
    }
    if (plan.cuentasDemoSalteadas > 0) {
        lineas.push(`cuentas de Mercado Libre en modo demostración salteadas (no tienen tokens reales): ${plan.cuentasDemoSalteadas}`);
    }
    const aRecifrar = plan.items.filter((i) => i.recifrar).length;
    lineas.push(`a re-cifrar a v2 con la clave actual: ${aRecifrar}`);
    const ilegibles = plan.items.filter((i) => i.ilegible);
    lineas.push(`ilegibles: ${ilegibles.length}`);
    for (const i of ilegibles.slice(0, 50)) {
        const kid = i.estado.version === 'v2' ? ` (clave ${i.estado.kid})` : '';
        lineas.push(`  ${i.contexto}${kid}: ${i.ilegible}`);
    }
    if (ilegibles.length > 50) lineas.push(`  … y ${ilegibles.length - 50} más`);
    return lineas;
}
