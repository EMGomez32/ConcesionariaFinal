import type { MercadoLibreCuenta } from '@prisma/client';
import prisma from '../database/prisma';
import { withAuthBypass } from '../database/unitOfWork';
import { logger } from '../logging/logger';
import { env } from '../../config/env';
import { conContextoSistema } from '../../application/services/consultaIngest';
import { ingestarPreguntasDeCuenta } from '../../application/services/meliPreguntas';
import { reconciliarPublicacion } from '../../application/services/meliPublicacion';
import { hayCredencialesMeli } from './meliClient';

/**
 * Worker de sincronización con Mercado Libre.
 *
 * Es la RED DE SEGURIDAD de los dos caminos en tiempo real, no el camino
 * principal:
 *  - Las preguntas entran por el webhook (`POST /api/webhooks/mercadolibre`),
 *    pero ML no garantiza la entrega: si una notificación se pierde o llega
 *    mientras el backend está caído, la pregunta quedaría sin aparecer nunca en
 *    la bandeja. El ciclo la levanta igual.
 *  - El precio y el estado del item se empujan al instante desde el vehículo
 *    (`sincronizarPorVehiculo`, best-effort), así que ese empujón puede fallar
 *    en silencio. La reconciliación periódica lo repara DE VERDAD: espeja lo que
 *    dice ML y vuelve a empujar la divergencia (`reconciliarPublicacion`). Sólo
 *    espejar era peor que no hacer nada — borraba el `ultimoError` del empuje
 *    fallido y dejaba la ficha diciendo "sincronizado recién".
 *
 * Nada de esto es urgente al segundo: el intervalo por defecto son 5 minutos y
 * las llamadas se espacian a propósito, porque la API de ML tiene cuota por
 * aplicación y un barrido apurado la quema para todos los tenants a la vez.
 */

/** Corrida inicial diferida: el arranque ya está ocupado con migrate/RLS/WhatsApp. */
const ARRANQUE_MS = 45 * 1000;
/** Techo de publicaciones reconciliadas por cuenta y por tick (cuota de la API). */
const PUBLICACIONES_POR_TICK = 20;
/** Espaciado entre cuentas dentro del mismo tick. */
const DELAY_ENTRE_CUENTAS_MS = 1_000;
/** Espaciado entre items de una misma cuenta (cada uno son 1..2 llamadas a ML). */
const DELAY_ENTRE_PUBLICACIONES_MS = 300;

const mensajeCorto = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err)).slice(0, 300);

// El timer va unref'eado: una espera de cortesía no debe demorar el shutdown.
const dormir = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => { setTimeout(resolve, ms).unref(); });

let enProceso = false;
// El aviso de "integración apagada" se emite UNA sola vez: las credenciales
// salen de process.env y no cambian en caliente, así que repetirlo en cada tick
// sólo ensucia el log de una instalación que a propósito no usa Mercado Libre.
let avisoSinCredenciales = false;

/**
 * Arranca el worker: una corrida inicial a los 45s del boot y luego una cada
 * ML_SYNC_INTERVAL_MS. NUNCA en tests (doble guarda: acá y en server.ts).
 */
export function iniciarWorkerMercadoLibre(): void {
    if (env.NODE_ENV === 'test') return;
    setTimeout(() => { void correrCiclo(); }, ARRANQUE_MS).unref();
    setInterval(() => { void correrCiclo(); }, env.ML_SYNC_INTERVAL_MS).unref();
    logger.info(`[ml-sync] worker iniciado: corrida inicial en ${ARRANQUE_MS / 1000}s, luego cada ${Math.round(env.ML_SYNC_INTERVAL_MS / 1000)}s`);
}

async function correrCiclo(): Promise<void> {
    if (enProceso) {
        // Un ciclo puede pasarse del intervalo si hay muchas cuentas (los delays
        // de cortesía se suman): el siguiente tick se saltea en vez de duplicar
        // el consumo de cuota.
        logger.warn('[ml-sync] ciclo anterior todavía en curso, se saltea esta corrida');
        return;
    }
    if (!hayCredencialesMeli()) {
        if (!avisoSinCredenciales) {
            avisoSinCredenciales = true;
            logger.warn('[ml-sync] sin ML_CLIENT_ID/ML_CLIENT_SECRET: la integración con Mercado Libre queda apagada (no se vuelve a avisar)');
        }
        return;
    }
    enProceso = true;
    try {
        // Barrido cross-tenant deliberado (el worker atiende todas las
        // concesionarias). TIENE que ir por withAuthBypass: en runtime la app se
        // conecta como app_rw (sin BYPASSRLS) y la policy tenant_iso exige
        // app.tenant_id o app.is_super_admin — sin esas GUC el findMany devuelve
        // CERO filas EN SILENCIO y el worker no sincroniza nada. Sin la
        // extensión, `activa` y `deletedAt` se filtran A MANO.
        const cuentas = await withAuthBypass((tx) => tx.mercadoLibreCuenta.findMany({
            where: { activa: true, deletedAt: null },
            orderBy: { id: 'asc' },
        }));
        for (const [indice, cuenta] of cuentas.entries()) {
            // Espaciado entre cuentas: la cuota de la API de ML es por
            // aplicación, no por vendedor, así que N tenants disparando a la vez
            // se pisan entre ellos.
            if (indice > 0) await dormir(DELAY_ENTRE_CUENTAS_MS);
            await procesarCuenta(cuenta);
        }
    } catch (err) {
        logger.error(`[ml-sync] ciclo falló: ${mensajeCorto(err)}`);
    } finally {
        enProceso = false;
    }
}

async function procesarCuenta(cuenta: MercadoLibreCuenta): Promise<void> {
    const errores: string[] = [];
    const etiqueta = cuenta.nickname ?? cuenta.mlUserId;
    try {
        // Contexto sintético del tenant: la extensión de Prisma scopea todo lo
        // que se lea o escriba acá adentro (preguntas, publicaciones, clientes)
        // a la concesionaria dueña de la cuenta.
        await conContextoSistema(cuenta.concesionariaId, async () => {
            // Los dos pasos van aislados a propósito: si la ingesta de preguntas
            // falla (token quemado, 500 de ML), la reconciliación de precio y
            // estado igual se intenta — no dependen una de la otra.
            try {
                const { nuevas, fallidas } = await ingestarPreguntasDeCuenta(cuenta.id);
                if (nuevas > 0) {
                    logger.info(`[ml-sync] cuenta ${cuenta.id} (${etiqueta}): ${nuevas} pregunta(s) nueva(s)`);
                }
                // Una pregunta que no se pudo guardar no rompe la corrida, pero
                // tampoco puede quedar en silencio: si el ciclo termina sin
                // errores, Configuración muestra "todo bien" mientras la bandeja
                // se queda vacía.
                if (fallidas > 0) {
                    errores.push(`preguntas: ${fallidas} no se pudieron guardar (ver el log)`);
                }
            } catch (err) {
                errores.push(`preguntas: ${mensajeCorto(err)}`);
                logger.error(`[ml-sync] cuenta ${cuenta.id} (${etiqueta}): ingesta de preguntas falló: ${mensajeCorto(err)}`);
            }
            try {
                const sincronizadas = await reconciliarPublicaciones(cuenta.id);
                if (sincronizadas > 0) {
                    logger.info(`[ml-sync] cuenta ${cuenta.id} (${etiqueta}): ${sincronizadas} publicación(es) reconciliada(s)`);
                }
            } catch (err) {
                errores.push(`publicaciones: ${mensajeCorto(err)}`);
                logger.error(`[ml-sync] cuenta ${cuenta.id} (${etiqueta}): reconciliación falló: ${mensajeCorto(err)}`);
            }
        });
    } catch (err) {
        // Una cuenta rota no corta el barrido de las demás.
        errores.push(mensajeCorto(err));
        logger.error(`[ml-sync] cuenta ${cuenta.id} (${etiqueta}): ${mensajeCorto(err)}`);
    }

    try {
        // Igual que la lectura: con app_rw la policy tenant_iso también aplica a
        // los UPDATE, así que sin el bypass esto afecta 0 filas en silencio y el
        // diagnóstico de la pantalla de Configuración nunca se entera.
        // Se limpia el ultimoError cuando el ciclo salió bien: dejarlo pegado
        // mostraría para siempre una falla ya superada.
        await withAuthBypass((tx) => tx.mercadoLibreCuenta.update({
            where: { id: cuenta.id },
            data: { ultimoError: errores.length ? errores.join(' | ').slice(0, 300) : null },
        }));
    } catch (err) {
        logger.error(`[ml-sync] cuenta ${cuenta.id}: no se pudo actualizar el estado: ${mensajeCorto(err)}`);
    }
}

/**
 * Reempuja precio y estado de las publicaciones vivas que quedaron atrasadas.
 * Devuelve cuántas se sincronizaron bien.
 */
async function reconciliarPublicaciones(cuentaId: number): Promise<number> {
    // Sólo las que no se tocaron en un intervalo completo: las que acaba de
    // sincronizar el webhook o el cambio de precio del vehículo se saltean, así
    // el tick no repite trabajo ni gasta cuota al pedo.
    const umbral = new Date(Date.now() - env.ML_SYNC_INTERVAL_MS);
    const publicaciones = await prisma.publicacionMl.findMany({
        where: {
            cuentaId,
            // 'borrador' todavía no existe en ML y 'cerrada'/'error' no se
            // reabren solas: no hay nada que reconciliar en ellas.
            estado: { in: ['activa', 'pausada'] },
            OR: [{ ultimaSyncAt: null }, { ultimaSyncAt: { lt: umbral } }],
        },
        // La nunca sincronizada es la más atrasada de todas; con el default de
        // Postgres (NULLS LAST) quedaría al fondo y nunca entraría en el lote de
        // 20 si la cuenta tiene muchas publicaciones. Desempate estable por id.
        orderBy: [{ ultimaSyncAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
        take: PUBLICACIONES_POR_TICK,
    });

    let sincronizadas = 0;
    for (const publicacion of publicaciones) {
        try {
            await reconciliarPublicacion(publicacion.id);
            sincronizadas += 1;
        } catch (err) {
            // Un item podrido (borrado en ML, categoría cambiada) no corta el
            // lote; reconciliarPublicacion ya deja el detalle en su ultimoError.
            logger.error(`[ml-sync] publicación ${publicacion.id} (item ${publicacion.itemId ?? 'sin item'}): ${mensajeCorto(err)}`);
        }
        await dormir(DELAY_ENTRE_PUBLICACIONES_MS);
    }
    return sincronizadas;
}
