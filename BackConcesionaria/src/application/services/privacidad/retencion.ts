import { Prisma, PrismaClient } from '@prisma/client';
import { suprimirTitular, borrarBinarios } from './supresionTitular';

/**
 * Lógica de la RETENCIÓN de datos personales (PRIV-02; ISO 27701 A.7.4.7 / A.7.4.8;
 * Ley 25.326 art. 4 inc. 7: los datos se destruyen cuando dejan de ser necesarios para
 * la finalidad). La corre `prisma/retencion.ts` (`npm run retencion`), que es quien
 * explica el uso, los plazos y las guardas: acá vive lo que se puede probar.
 *
 * No importa `config/env` ni el cliente de runtime: el script trae su propio
 * PrismaClient con la conexión de migraciones (DATABASE_URL), porque audit_log y
 * security_events son append-only para el rol de la app (app_rw) y borrar lo vencido
 * es justamente lo que ese rol no puede hacer.
 */

export type Categoria = 'leads' | 'adjuntos' | 'auditoria' | 'tokens';
export const CATEGORIAS: readonly Categoria[] = ['leads', 'adjuntos', 'auditoria', 'tokens'];

export interface PlazosRetencion {
    /** Leads sin actividad ni operaciones: se anonimizan (supresión total). */
    leadsMeses: number;
    /** Adjuntos de solicitudes rechazadas o canceladas (desistidas): se borran. */
    adjuntosRechazadasMeses: number;
    /** audit_log y security_events: se borran las filas más viejas. */
    auditoriaMeses: number;
}

/** Defaults razonables mientras el dueño no fije la política (ver encabezado del script). */
export const PLAZOS_POR_DEFECTO: PlazosRetencion = {
    leadsMeses: 24,
    adjuntosRechazadasMeses: 6,
    auditoriaMeses: 24,
};

/**
 * Pisos ANTI-ACCIDENTE: un `RETENCION_AUDITORIA_MESES=2` tipeado de apuro borraría casi
 * todo el rastro. Por debajo de estos valores el script no arranca. `0` (desactivar la
 * categoría) siempre se acepta.
 */
export const PLAZOS_MINIMOS: PlazosRetencion = {
    leadsMeses: 6,
    adjuntosRechazadasMeses: 1,
    auditoriaMeses: 12,
};

const VARIABLES: Record<keyof PlazosRetencion, string> = {
    leadsMeses: 'RETENCION_LEADS_MESES',
    adjuntosRechazadasMeses: 'RETENCION_ADJUNTOS_RECHAZADAS_MESES',
    auditoriaMeses: 'RETENCION_AUDITORIA_MESES',
};

/** Lee los plazos del entorno. Lanza con un mensaje claro si alguno es inválido. */
export function leerPlazos(entorno: Record<string, string | undefined>): PlazosRetencion {
    const plazos = { ...PLAZOS_POR_DEFECTO };
    for (const clave of Object.keys(VARIABLES) as (keyof PlazosRetencion)[]) {
        const crudo = entorno[VARIABLES[clave]];
        if (crudo === undefined || crudo.trim() === '') continue;
        const n = Number(crudo);
        if (!Number.isInteger(n) || n < 0) {
            throw new Error(`${VARIABLES[clave]}=${crudo}: tiene que ser un entero de meses (0 = no aplicar esta categoría).`);
        }
        if (n !== 0 && n < PLAZOS_MINIMOS[clave]) {
            throw new Error(`${VARIABLES[clave]}=${n}: el mínimo es ${PLAZOS_MINIMOS[clave]} meses (o 0 para no aplicarla). Es una guarda contra un valor tipeado de más.`);
        }
        plazos[clave] = n;
    }
    return plazos;
}

export interface ArgsRetencion {
    aplicar: boolean;
    sinTope: boolean;
    concesionariaId: number | null;
    categorias: Categoria[];
}

/** `--apply`, `--sin-tope`, `--concesionaria=N`, `--solo=leads,adjuntos`. Lo demás es error. */
export function leerArgs(argv: string[]): ArgsRetencion {
    const args: ArgsRetencion = { aplicar: false, sinTope: false, concesionariaId: null, categorias: [...CATEGORIAS] };
    for (const a of argv) {
        if (a === '--apply') args.aplicar = true;
        else if (a === '--sin-tope') args.sinTope = true;
        else if (a.startsWith('--concesionaria=')) {
            const n = Number(a.slice('--concesionaria='.length));
            if (!Number.isInteger(n) || n <= 0) throw new Error(`${a}: el id de concesionaria tiene que ser un entero positivo.`);
            args.concesionariaId = n;
        } else if (a.startsWith('--solo=')) {
            const pedidas = a.slice('--solo='.length).split(',').map((s) => s.trim()).filter(Boolean);
            const malas = pedidas.filter((p) => !CATEGORIAS.includes(p as Categoria));
            if (pedidas.length === 0 || malas.length > 0) {
                throw new Error(`${a}: categorías válidas: ${CATEGORIAS.join(', ')}.`);
            }
            args.categorias = pedidas as Categoria[];
        } else {
            throw new Error(`Argumento desconocido: ${a}. Usá --apply, --sin-tope, --concesionaria=N o --solo=${CATEGORIAS.join(',')}.`);
        }
    }
    return args;
}

/** Resta meses de calendario (31-mar − 1 mes = 28/29-feb, no 3-mar). */
export function restarMeses(fecha: Date, meses: number): Date {
    const d = new Date(fecha.getTime());
    const dia = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - meses);
    const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dia, ultimo));
    return d;
}

export interface Cortes {
    leads: Date | null;
    adjuntos: Date | null;
    auditoria: Date | null;
}

/** Fecha límite por categoría (null = categoría desactivada con 0). */
export function calcularCortes(plazos: PlazosRetencion, ahora: Date): Cortes {
    return {
        leads: plazos.leadsMeses > 0 ? restarMeses(ahora, plazos.leadsMeses) : null,
        adjuntos: plazos.adjuntosRechazadasMeses > 0 ? restarMeses(ahora, plazos.adjuntosRechazadasMeses) : null,
        auditoria: plazos.auditoriaMeses > 0 ? restarMeses(ahora, plazos.auditoriaMeses) : null,
    };
}

/** Tope de fichas por corrida: más que esto sin `--sin-tope` es probablemente un error. */
export const TOPE_LEADS_POR_CORRIDA = 500;

// ─────────────────────────────────────────────────────────────────────────────
// PLAN (lo que haría) y EJECUCIÓN
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanRetencion {
    cortes: Cortes;
    leads: Array<{ id: number; concesionariaId: number }>;
    adjuntos: Array<{ id: number; solicitudId: number; concesionariaId: number | null; storageKey: string | null }>;
    auditLog: number;
    securityEvents: number;
    refreshTokens: number;
    resetTokens: number;
}

/**
 * Leads "muertos": fichas sin NINGUNA operación que obligue a conservar (ventas,
 * reservas, financiaciones, unidades que entregó) y cuya última actividad —de la ficha
 * o de cualquier cosa colgada de ella— es anterior al corte. Se cuenta como actividad
 * todo lo que muestra que la relación sigue: la edición de la ficha, una atención, un
 * seguimiento, un mensaje, un presupuesto, una solicitud, una tasación o una pregunta
 * de Mercado Libre. Un pedido de derechos ABIERTO también la frena: se resuelve a mano.
 */
async function leadsVencidos(db: PrismaClient, corte: Date, concesionariaId: number | null) {
    const deTenant = concesionariaId ? Prisma.sql`AND c.concesionaria_id = ${concesionariaId}` : Prisma.empty;
    const epoch = Prisma.sql`'epoch'::timestamp`;
    return db.$queryRaw<Array<{ id: number; concesionariaId: number }>>`
        SELECT c.id, c.concesionaria_id AS "concesionariaId"
        FROM clientes c
        WHERE c.suprimido_en IS NULL
          ${deTenant}
          AND GREATEST(
                c.created_at,
                c.updated_at,
                COALESCE(c.ultima_interaccion_en, ${epoch}),
                COALESCE((SELECT max(a.iniciada_en) FROM atenciones a WHERE a.cliente_id = c.id), ${epoch}),
                COALESCE((SELECT max(s.created_at) FROM cliente_seguimientos s WHERE s.cliente_id = c.id), ${epoch}),
                COALESCE((SELECT max(v.ultimo_mensaje_at) FROM conversaciones v WHERE v.cliente_id = c.id), ${epoch}),
                COALESCE((SELECT max(p.created_at) FROM presupuestos p WHERE p.cliente_id = c.id), ${epoch}),
                COALESCE((SELECT max(sf.updated_at) FROM solicitudes_financiacion sf WHERE sf.cliente_id = c.id), ${epoch}),
                COALESCE((SELECT max(t.updated_at) FROM tasaciones t WHERE t.cliente_id = c.id), ${epoch}),
                COALESCE((SELECT max(q.preguntada_en) FROM preguntas_ml q WHERE q.cliente_id = c.id), ${epoch})
              ) < ${corte}
          AND NOT EXISTS (SELECT 1 FROM ventas x WHERE x.cliente_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM reservas x WHERE x.cliente_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM financiaciones x WHERE x.cliente_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM ingresos_vehiculo x WHERE x.cliente_origen_id = c.id)
          AND NOT EXISTS (
                SELECT 1 FROM solicitudes_titular st
                WHERE st.cliente_id = c.id AND st.estado IN ('pendiente', 'en_curso')
              )
        ORDER BY c.id`;
}

/**
 * Adjuntos (DNI, recibos) que ya no sirven: los de solicitudes RECHAZADAS o CANCELADAS
 * (el cliente desistió) cuya respuesta es anterior al corte, y los de solicitudes DADAS
 * DE BAJA sin importar la fecha — desde que la baja borra los adjuntos (ver
 * adjuntosSolicitud.ts) eso sólo puede ser el remanente de antes del cambio.
 */
async function adjuntosVencidos(db: PrismaClient, corte: Date | null, concesionariaId: number | null) {
    const condiciones: Prisma.SolicitudFinanciacionWhereInput[] = [{ deletedAt: { not: null } }];
    if (corte) {
        condiciones.push({
            estado: { in: ['rechazada', 'cancelada'] },
            OR: [{ fechaRespuesta: { lt: corte } }, { fechaRespuesta: null, updatedAt: { lt: corte } }],
        });
    }
    return db.solicitudFinanciacionArchivo.findMany({
        where: {
            solicitud: { OR: condiciones, ...(concesionariaId ? { concesionariaId } : {}) },
        },
        select: { id: true, solicitudId: true, concesionariaId: true, storageKey: true },
        orderBy: { id: 'asc' },
    });
}

export async function planificarRetencion(
    db: PrismaClient,
    opts: { plazos: PlazosRetencion; ahora: Date; concesionariaId: number | null; categorias: Categoria[] },
): Promise<PlanRetencion> {
    const cortes = calcularCortes(opts.plazos, opts.ahora);
    const quiere = (c: Categoria) => opts.categorias.includes(c);
    const tenant = opts.concesionariaId;
    // security_events y los tokens son de PLATAFORMA (sin tenant): con `--concesionaria`
    // no se tocan, para que una corrida acotada a un cliente no borre nada ajeno.
    const global = tenant === null;

    const [leads, adjuntos, auditLog, securityEvents, refreshTokens, resetTokens] = await Promise.all([
        quiere('leads') && cortes.leads ? leadsVencidos(db, cortes.leads, tenant) : Promise.resolve([]),
        quiere('adjuntos') ? adjuntosVencidos(db, cortes.adjuntos, tenant) : Promise.resolve([]),
        quiere('auditoria') && cortes.auditoria
            ? db.auditLog.count({ where: { createdAt: { lt: cortes.auditoria }, ...(tenant ? { concesionariaId: tenant } : {}) } })
            : Promise.resolve(0),
        quiere('auditoria') && cortes.auditoria && global
            ? db.securityEvent.count({ where: { createdAt: { lt: cortes.auditoria } } })
            : Promise.resolve(0),
        quiere('tokens') && global ? db.refreshToken.count({ where: { expiresAt: { lt: opts.ahora } } }) : Promise.resolve(0),
        quiere('tokens') && global
            ? db.passwordResetToken.count({ where: { OR: [{ expiresAt: { lt: opts.ahora } }, { usedAt: { not: null } }] } })
            : Promise.resolve(0),
    ]);

    return { cortes, leads, adjuntos, auditLog, securityEvents, refreshTokens, resetTokens };
}

export interface ResultadoRetencion {
    leadsAnonimizados: number;
    adjuntosBorrados: number;
    archivosBorradosDelDisco: number;
    auditLogBorrados: number;
    securityEventsBorrados: number;
    refreshTokensBorrados: number;
    resetTokensBorrados: number;
    errores: string[];
}

/**
 * Ejecuta el plan. Cada ficha va en SU transacción: un error en una no deja a medias a
 * las demás ni deshace lo ya hecho. Deja rastro en el audit_log de cada concesionaria
 * (lo que se suprimió de SUS datos) y un resumen en security_events.
 */
export async function aplicarRetencion(
    db: PrismaClient,
    plan: PlanRetencion,
    opts: { plazos: PlazosRetencion; ahora: Date; concesionariaId: number | null; borrarArchivo: (storageKey: string) => Promise<void> },
): Promise<ResultadoRetencion> {
    const r: ResultadoRetencion = {
        leadsAnonimizados: 0, adjuntosBorrados: 0, archivosBorradosDelDisco: 0, auditLogBorrados: 0,
        securityEventsBorrados: 0, refreshTokensBorrados: 0, resetTokensBorrados: 0, errores: [],
    };
    const motivoLead = `Retención: lead sin actividad ni operaciones por más de ${opts.plazos.leadsMeses} meses`;

    // ── Leads ────────────────────────────────────────────────────────────────
    for (const lead of plan.leads) {
        try {
            const res = await db.$transaction(async (tx) => {
                await tx.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'true', true)`);
                const s = await suprimirTitular(tx, { concesionariaId: lead.concesionariaId, clienteId: lead.id, motivo: motivoLead, ahora: opts.ahora });
                await tx.auditLog.create({
                    data: {
                        concesionariaId: lead.concesionariaId,
                        entidad: 'Cliente',
                        entidadId: lead.id,
                        accion: 'suprimir',
                        detalle: `${motivoLead}. Supresión ${s.modo} automática (script de retención).`,
                    },
                });
                return s;
            }, { timeout: 60_000 });
            const b = await borrarBinarios(res.storageKeys, opts.borrarArchivo);
            r.archivosBorradosDelDisco += b.borrados;
            r.adjuntosBorrados += res.suprimido.adjuntos ?? 0;
            r.leadsAnonimizados++;
        } catch (err) {
            r.errores.push(`cliente ${lead.id}: ${(err as Error).message}`);
        }
    }

    // ── Adjuntos de solicitudes muertas ─────────────────────────────────────
    if (plan.adjuntos.length > 0) {
        const porTenant = new Map<number, { solicitudes: Set<number>; filas: number }>();
        for (const a of plan.adjuntos) {
            if (a.storageKey) {
                try {
                    await opts.borrarArchivo(a.storageKey);
                    r.archivosBorradosDelDisco++;
                } catch (err) {
                    r.errores.push(`adjunto ${a.id}: ${(err as Error).message}`);
                }
            }
        }
        const { count } = await db.solicitudFinanciacionArchivo.deleteMany({ where: { id: { in: plan.adjuntos.map((a) => a.id) } } });
        r.adjuntosBorrados += count;
        for (const a of plan.adjuntos) {
            if (!a.concesionariaId) continue;
            const t = porTenant.get(a.concesionariaId) ?? { solicitudes: new Set<number>(), filas: 0 };
            t.solicitudes.add(a.solicitudId);
            t.filas++;
            porTenant.set(a.concesionariaId, t);
        }
        for (const [concesionariaId, t] of porTenant) {
            await db.auditLog.create({
                data: {
                    concesionariaId,
                    entidad: 'SolicitudFinanciacionArchivo',
                    accion: 'delete',
                    detalle: `Retención: ${t.filas} adjunto(s) de ${t.solicitudes.size} solicitud(es) rechazadas, canceladas o dadas de baja borrados (archivo y registro). Solicitudes: ${[...t.solicitudes].slice(0, 50).join(', ')}`.slice(0, 1000),
                },
            });
        }
    }

    // ── Rastro vencido ──────────────────────────────────────────────────────
    // Va DESPUÉS de lo de arriba a propósito: las filas de auditoría que acaba de
    // escribir esta corrida son de hoy y no caen en el corte.
    if (plan.cortes.auditoria && plan.auditLog > 0) {
        r.auditLogBorrados = (await db.auditLog.deleteMany({
            where: { createdAt: { lt: plan.cortes.auditoria }, ...(opts.concesionariaId ? { concesionariaId: opts.concesionariaId } : {}) },
        })).count;
    }
    if (plan.cortes.auditoria && plan.securityEvents > 0 && opts.concesionariaId === null) {
        r.securityEventsBorrados = (await db.securityEvent.deleteMany({ where: { createdAt: { lt: plan.cortes.auditoria } } })).count;
    }

    // ── Credenciales vencidas ───────────────────────────────────────────────
    if (plan.refreshTokens > 0) {
        r.refreshTokensBorrados = (await db.refreshToken.deleteMany({ where: { expiresAt: { lt: opts.ahora } } })).count;
    }
    if (plan.resetTokens > 0) {
        r.resetTokensBorrados = (await db.passwordResetToken.deleteMany({
            where: { OR: [{ expiresAt: { lt: opts.ahora } }, { usedAt: { not: null } }] },
        })).count;
    }

    // Constancia de PLATAFORMA de que la purga corrió (sobrevive al borrado del audit_log
    // de cada tenant y es lo que se le muestra a un auditor: "la política se aplica").
    await db.securityEvent.create({
        data: {
            accion: 'retencion',
            entidad: 'Retencion',
            concesionariaId: opts.concesionariaId,
            detalle: (
                `Script de retención aplicado. Plazos (meses): leads ${opts.plazos.leadsMeses}, adjuntos ${opts.plazos.adjuntosRechazadasMeses}, ` +
                `auditoría ${opts.plazos.auditoriaMeses}. Resultado: ${r.leadsAnonimizados} lead(s) anonimizados, ${r.adjuntosBorrados} adjunto(s), ` +
                `${r.auditLogBorrados} audit_log, ${r.securityEventsBorrados} security_events, ${r.refreshTokensBorrados} refresh tokens, ` +
                `${r.resetTokensBorrados} tokens de reset. Errores: ${r.errores.length}.`
            ).slice(0, 1000),
        },
    });

    return r;
}
