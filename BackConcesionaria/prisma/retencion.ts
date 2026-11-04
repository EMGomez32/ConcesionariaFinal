/**
 * retencion.ts — aplica la política de RETENCIÓN de datos personales (PRIV-02).
 *
 * Ley 25.326 art. 4 inc. 7: los datos se destruyen cuando dejan de ser necesarios para
 * la finalidad con que se recolectaron. ISO 27701 A.7.4.7 (retención) y A.7.4.8
 * (disposición). Sin esto todo se guardaba para siempre: el soft-delete no borra nada.
 *
 * ── USO ──────────────────────────────────────────────────────────────────────────
 *   npm run retencion                         # SIMULACIÓN (dry-run): sólo informa
 *   npm run retencion -- --apply              # aplica
 *   npm run retencion -- --concesionaria=7    # sólo los datos de esa concesionaria
 *   npm run retencion -- --solo=adjuntos,tokens
 *   npm run retencion -- --apply --sin-tope   # ver "Guardas"
 *
 * En el servidor (contenedor del backend, que ya tiene DATABASE_URL y UPLOADS_DIR):
 *   docker compose exec -T backend npm run retencion </dev/null
 *   docker compose exec -T backend npm run retencion -- --apply </dev/null
 * (el `</dev/null` evita que `exec -T` se coma el stdin de un script pipeado por SSH).
 * Pensado para correr una vez por día o por semana desde un cron del host.
 *
 * ── QUÉ HACE Y PLAZOS POR DEFECTO (configurables por variable de entorno) ─────────
 *   RETENCION_LEADS_MESES=24
 *       Leads sin actividad ni operaciones por más de 24 meses → se ANONIMIZAN (misma
 *       supresión total que el botón de la ficha: datos de contacto, notas, mensajes y
 *       adjuntos fuera; la ficha queda como "Titular suprimido" y dada de baja).
 *       "Sin operaciones" = sin ventas, reservas, financiaciones ni unidades entregadas;
 *       esos casos los cubre la obligación legal de conservar y NO se tocan.
 *       "Actividad" = la última edición de la ficha, atención, seguimiento, mensaje,
 *       presupuesto, solicitud, tasación o pregunta de ML. Un pedido de derechos
 *       abierto también la frena.
 *   RETENCION_ADJUNTOS_RECHAZADAS_MESES=6
 *       Adjuntos (DNI, recibos de sueldo) de solicitudes de financiación RECHAZADAS o
 *       CANCELADAS hace más de 6 meses → se borran (archivo y registro). Los de
 *       solicitudes DADAS DE BAJA se borran siempre (remanente de antes de que la baja
 *       los borrara sola).
 *   RETENCION_AUDITORIA_MESES=24
 *       audit_log y security_events de más de 24 meses → se borran. Dos años cubren el
 *       uso probatorio habitual (reclamos, auditorías anuales); si el asesor legal pide
 *       más (p. ej. 5 años por prescripción), se sube acá.
 *   (sin variable) Tokens de sesión (refresh) vencidos y tokens de recuperación de
 *       contraseña vencidos o ya usados → se borran.
 *   Un valor 0 desactiva esa categoría. Los plazos son DEFAULTS RAZONABLES, no la
 *   política: la fija el dueño con asesoría legal y se documenta en la política de
 *   retención.
 *
 * ── GUARDAS ANTI-ACCIDENTE ───────────────────────────────────────────────────────
 *   1. Por defecto es una SIMULACIÓN: cuenta y lista, no modifica nada. Aplicar exige
 *      `--apply` explícito.
 *   2. Pisos mínimos: leads ≥ 6 meses, adjuntos ≥ 1 mes, auditoría ≥ 12 meses (o 0).
 *      Un valor menor aborta (un "2" tipeado de apuro borraría casi todo el rastro).
 *   3. Tope por corrida: si hay más de 500 fichas para anonimizar, no aplica sin
 *      `--sin-tope` (un reloj corrido o una base equivocada se ven así).
 *   4. Argumentos desconocidos abortan: un `--aply` mal escrito no puede terminar en una
 *      corrida que el operador cree que fue real.
 *   5. Con `--concesionaria=N` sólo se tocan datos de ese tenant: security_events y los
 *      tokens (de plataforma, sin tenant) quedan afuera.
 *
 * ── POR QUÉ CON DATABASE_URL ─────────────────────────────────────────────────────
 * audit_log y security_events son APPEND-ONLY para el rol de la app (setup-app-role:
 * REVOKE UPDATE, DELETE). Purgarlos es justamente lo que ese rol no puede hacer, así
 * que el script usa la conexión de migraciones, igual que init-rls. Y como esa conexión
 * es superusuario (la RLS no filtra), todo where lleva el tenant explícito.
 *
 * Cada corrida aplicada deja rastro: una fila `suprimir`/`delete` en el audit_log de
 * cada concesionaria afectada y un resumen `retencion` en security_events.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { storage } from '../src/infrastructure/storage/LocalStorageAdapter';
import {
    leerArgs,
    leerPlazos,
    planificarRetencion,
    aplicarRetencion,
    TOPE_LEADS_POR_CORRIDA,
} from '../src/application/services/privacidad/retencion';

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : 'desactivado');
const muestra = (ids: number[]) => (ids.length ? ` [${ids.slice(0, 20).join(', ')}${ids.length > 20 ? ', …' : ''}]` : '');

async function main() {
    const args = leerArgs(process.argv.slice(2));
    const plazos = leerPlazos(process.env);
    if (!process.env.DATABASE_URL) {
        throw new Error('Falta DATABASE_URL (la conexión de migraciones). El script no corre contra la conexión de la app.');
    }

    const connectionString = process.env.DATABASE_URL.replace('prisma+postgres://', 'postgres://');
    // max 1: el set_config de sesión de abajo vale para todas las consultas.
    const pool = new Pool({ connectionString, max: 1 });
    const db = new PrismaClient({ adapter: new PrismaPg(pool) } as any);
    try {
        await db.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'true', false)`);
        const ahora = new Date();
        const opts = { plazos, ahora, concesionariaId: args.concesionariaId, categorias: args.categorias };

        console.log(`[retencion] ${args.aplicar ? 'APLICANDO' : 'SIMULACIÓN (dry-run; nada se modifica, usá --apply para aplicar)'}`);
        console.log(`[retencion] alcance: ${args.concesionariaId ? `concesionaria ${args.concesionariaId}` : 'todas las concesionarias'}; categorías: ${args.categorias.join(', ')}`);

        const plan = await planificarRetencion(db, opts);
        console.log(`[retencion] cortes: leads < ${dia(plan.cortes.leads)} · adjuntos < ${dia(plan.cortes.adjuntos)} · auditoría < ${dia(plan.cortes.auditoria)}`);
        console.log(`[retencion] leads a anonimizar: ${plan.leads.length}${muestra(plan.leads.map((l) => l.id))}`);
        console.log(`[retencion] adjuntos a borrar: ${plan.adjuntos.length} (de ${new Set(plan.adjuntos.map((a) => a.solicitudId)).size} solicitud(es))`);
        console.log(`[retencion] audit_log a borrar: ${plan.auditLog} · security_events: ${plan.securityEvents}`);
        console.log(`[retencion] refresh tokens vencidos: ${plan.refreshTokens} · tokens de reset vencidos/usados: ${plan.resetTokens}`);

        if (!args.aplicar) {
            console.log('[retencion] fin de la simulación.');
            return;
        }
        if (plan.leads.length > TOPE_LEADS_POR_CORRIDA && !args.sinTope) {
            console.error(
                `[retencion] ABORTADO: ${plan.leads.length} fichas superan el tope de ${TOPE_LEADS_POR_CORRIDA} por corrida. ` +
                'Revisá el reloj del servidor y la base; si es correcto, repetí con --sin-tope.',
            );
            process.exitCode = 1;
            return;
        }

        const r = await aplicarRetencion(db, plan, { ...opts, borrarArchivo: (k) => storage.delete(k) });
        console.log(
            `[retencion] listo: ${r.leadsAnonimizados} lead(s) anonimizados, ${r.adjuntosBorrados} adjunto(s) borrados ` +
            `(${r.archivosBorradosDelDisco} archivo(s) del disco), ${r.auditLogBorrados} audit_log, ${r.securityEventsBorrados} security_events, ` +
            `${r.refreshTokensBorrados} refresh tokens, ${r.resetTokensBorrados} tokens de reset.`,
        );
        if (r.errores.length > 0) {
            console.error(`[retencion] ${r.errores.length} error(es):\n  ${r.errores.slice(0, 50).join('\n  ')}`);
            process.exitCode = 1;
        }
    } finally {
        await db.$disconnect();
        await pool.end();
    }
}

main().catch((e) => {
    console.error('[retencion] falló:', e instanceof Error ? e.message : e);
    process.exit(1);
});
