import prisma from '../database/prisma';
import { withAuthBypass } from '../database/unitOfWork';
import { logger } from '../logging/logger';
import { env } from '../../config/env';
import { corteDeLaJornada, ventanaDeAlertaDesde } from '../../domain/services/jornada';

/**
 * CIERRE DIARIO DE ATENCIONES.
 *
 * Decisión del dueño: "Atenciones que quedan abiertas al cierre del día: SE
 * CIERRAN POR SISTEMA, y al vendedor le tiene que saltar una ALERTA con cuántas
 * dejó abiertas sin cerrar."
 *
 * Qué hace, en una línea: pasada la hora de corte local, toda `Atencion` que siga
 * en `abierta` pasa a `cerrada` con `cerradaAutomaticamente = true` y resultado
 * `se_retiro`.
 *
 * ── POR QUÉ `se_retiro` Y NO NULL ────────────────────────────────────────────
 * El criterio de aceptación 6 dice que ninguna atención queda cerrada sin
 * resultado. Un cierre por sistema con `resultado: null` sería exactamente eso, y
 * además rompería cualquier reporte que agrupe por resultado. `se_retiro` ("se
 * retiró sin definir") es lo que de hecho pasó: el vendedor nunca la cerró, así
 * que no hay definición. La marca `cerradaAutomaticamente` es la que distingue
 * este cierre del que hizo una persona — sin ella, las estadísticas de resultados
 * quedarían contaminadas con el trabajo que el sistema hizo por el vendedor.
 *
 * NO se exige próximo contacto en este camino (el criterio 6 lo exige para los
 * resultados no definitivos que cierra UNA PERSONA). El sistema no puede inventar
 * una fecha ni un medio de contacto; lo que hace en cambio es avisarle al vendedor,
 * que es lo que el dueño pidió.
 *
 * ── IDEMPOTENCIA ─────────────────────────────────────────────────────────────
 * Dos garantías, no una:
 *
 *   1. El `updateMany` filtra por `estado: 'abierta'`. Correrlo dos veces en el
 *      mismo día encuentra cero filas la segunda vez: no hay nada que cerrar dos
 *      veces, y `cerradaEn` no se pisa.
 *   2. LA ALERTA NO ES UNA FILA. No se inserta ninguna notificación: el conteo
 *      "dejaste N sin cerrar" se DERIVA en la lectura, contando las atenciones con
 *      `cerradaAutomaticamente = true` cerradas dentro de la jornada. Una alerta
 *      que no se escribe no se puede duplicar — es la forma más fuerte de
 *      idempotencia disponible, y de paso no agrega una tabla de notificaciones
 *      que hoy no existe (ver `contarAtencionesCerradasPorSistema`, que es lo que
 *      consume la campanita).
 *
 * ── POR QUÉ NO ES UN CRON A LAS 21:00 ────────────────────────────────────────
 * El worker corre cada 15 minutos y pregunta si ya pasó el corte de HOY. Un cron
 * de disparo único a las 21:00 se pierde el día entero si el contenedor estaba
 * reiniciando en ese minuto. Así, un deploy a las 20:58 no deja 40 atenciones
 * abiertas hasta mañana.
 *
 * ── POR QUÉ EL BARRIDO VA POR `withAuthBypass` ───────────────────────────────
 * Es cross-tenant deliberado (atiende a todas las concesionarias) y en runtime la
 * app se conecta como `app_rw`, sin BYPASSRLS: `rawPrisma` pelado devolvería CERO
 * filas EN SILENCIO y el worker no cerraría nada sin tirar un solo error. Mismo
 * patrón que emailIngest. Sin la extensión de Prisma, `deletedAt` se filtra A MANO.
 */

/** Cada cuánto se pregunta si ya pasó el corte. */
const INTERVALO_MS = 15 * 60 * 1000;
/** Primera corrida al minuto del boot (después de que la base esté lista). */
const ARRANQUE_MS = 60 * 1000;

let enProceso = false;

const mensajeCorto = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err)).slice(0, 300);

// El cálculo del corte vive en `domain/services/jornada.ts` (PURO, testeable sin
// base): la aritmética de fechas es la parte que se rompe en silencio y tiene que
// poder probarse sin levantar el stack. Se re-exporta para quien ya lo importaba
// de acá.
export { corteDeLaJornada };

/**
 * Cierra las atenciones abiertas anteriores al corte. Devuelve cuántas cerró.
 *
 * Exportada para poder correrla a mano (script/test) sin levantar el intervalo.
 */
export async function cerrarAtencionesVencidas(ahora: Date = new Date()): Promise<number> {
    const corte = corteDeLaJornada(ahora, env.ATENCION_CIERRE_HORA, env.ATENCION_CIERRE_UTC_OFFSET);

    const resultado = await withAuthBypass((tx) => tx.atencion.updateMany({
        where: {
            estado: 'abierta',
            // Sólo las de jornadas ya terminadas. Una atención abierta HOY a las
            // 19 h, con el corte de hoy a las 21, todavía no entra: `corte` es el de
            // ayer mientras no pase la hora, así que `iniciadaEn < corte` la deja
            // afuera. La que se abrió ayer a las 19 sí entra.
            iniciadaEn: { lt: corte },
            // La extensión de Prisma no participa acá (bypass): el soft-delete se
            // filtra a mano o el worker "cerraría" atenciones borradas.
            deletedAt: null,
        },
        data: {
            estado: 'cerrada',
            resultado: 'se_retiro',
            cerradaEn: ahora,
            cerradaAutomaticamente: true,
        },
    }));

    if (resultado.count > 0) {
        logger.warn(`[cierre-atenciones] ${resultado.count} atención(es) cerradas por sistema (corte ${corte.toISOString()})`);
    }
    return resultado.count;
}

/**
 * Cuántas atenciones le cerró el sistema a un vendedor dentro de la ventana de la
 * alerta (ver `DIAS_VENTANA_ALERTA`: NO es sólo la última jornada).
 *
 * ES LA ALERTA. No hay tabla de notificaciones: el número se deriva de la marca
 * `cerradaAutomaticamente` que dejó el worker. Lo consume
 * `GET /reportes/alertas-resumen`, que es de donde se alimenta la campanita del
 * TopBar — el lugar por donde el vendedor ya mira.
 *
 * `vendedorId` en null cuenta las del tenant entero (vista del admin).
 *
 * Va por la instancia normal de Prisma (no bypass): esto corre DENTRO de un
 * request, con contexto de usuario, así que la extensión scopea el tenant y filtra
 * el soft-delete como en cualquier otra lectura.
 */
export async function contarAtencionesCerradasPorSistema(
    vendedorId: number | null,
    ahora: Date = new Date(),
): Promise<number> {
    const desde = ventanaDeAlerta(ahora);
    return prisma.atencion.count({
        where: {
            cerradaAutomaticamente: true,
            cerradaEn: { gte: desde },
            ...(vendedorId ? { vendedorId } : {}),
        },
    });
}

/** El corte vigente de la jornada: lo que el worker ya cerró o va a cerrar. */
export function corteVigenteDeLaJornada(ahora: Date = new Date()): Date {
    return corteDeLaJornada(ahora, env.ATENCION_CIERRE_HORA, env.ATENCION_CIERRE_UTC_OFFSET);
}

/**
 * Cuántos días para atrás mira la alerta de "te las cerró el sistema".
 *
 * TIENE QUE SOBREVIVIR A LOS DÍAS EN QUE EL SALÓN NO ABRE. Antes la ventana era
 * el corte VIGENTE, o sea las últimas 24 h, y el worker corre igual sábados y
 * domingos: el vendedor que el viernes dejaba 4 atenciones abiertas las veía
 * cerradas el sábado, y el lunes a la mañana la campanita mostraba 0 —los cortes
 * del sábado y del domingo habían corrido la ventana hacia adelante sin que
 * nadie entrara al sistema—. La alerta que el dueño pidió ("al vendedor le tiene
 * que saltar cuántas dejó abiertas sin cerrar") se perdía todos los fines de
 * semana, más francos, licencias y enfermedad.
 *
 * 7 días cubre un fin de semana largo y una semana de licencia corta sin volverse
 * ruido permanente: pasada la semana, la señal caduca sola. Sigue sin haber tabla
 * de notificaciones — el conteo se deriva de `cerradaAutomaticamente`, así que la
 * alerta no se puede duplicar ni hay que ir a marcarla como leída.
 */
export const DIAS_VENTANA_ALERTA = 7;

/**
 * Inicio de la ventana de la alerta: el corte de hace `DIAS_VENTANA_ALERTA` días.
 * Se ancla al corte —y no a "ahora menos 7 días"— para que la ventana empiece
 * siempre en un borde de jornada y el conteo no baile según la hora en que el
 * vendedor abra la pantalla.
 */
export function ventanaDeAlerta(ahora: Date = new Date()): Date {
    // La aritmética vive en el dominio (`jornada.ts`), que es PURO y se testea
    // sin base: un error de un día acá apaga la alerta entera en silencio.
    return ventanaDeAlertaDesde(corteVigenteDeLaJornada(ahora), DIAS_VENTANA_ALERTA);
}

async function correrCiclo(): Promise<void> {
    if (enProceso) {
        logger.warn('[cierre-atenciones] ciclo anterior todavía en curso, se saltea esta corrida');
        return;
    }
    enProceso = true;
    try {
        await cerrarAtencionesVencidas();
    } catch (err) {
        logger.error(`[cierre-atenciones] ciclo falló: ${mensajeCorto(err)}`);
    } finally {
        enProceso = false;
    }
}

/**
 * Arranca el worker: una corrida al minuto del boot y luego cada 15 minutos.
 * NUNCA en tests (doble guarda: acá y en server.ts, igual que emailIngest).
 */
export function iniciarWorkerCierreAtenciones(): void {
    if (env.NODE_ENV === 'test') return;
    setTimeout(() => { void correrCiclo(); }, ARRANQUE_MS).unref();
    setInterval(() => { void correrCiclo(); }, INTERVALO_MS).unref();
    logger.info(`[cierre-atenciones] worker iniciado: corte ${env.ATENCION_CIERRE_HORA}:00 (UTC${env.ATENCION_CIERRE_UTC_OFFSET}), revisión cada 15 min`);
}
