import { env } from '../../../config/env';
import config from '../../../config';

/**
 * VIGENCIA DE UNA SESIÓN (APP-11).
 *
 * Una sesión tiene dos relojes:
 *  - el DESLIZANTE: cada refresh emitido vale JWT_REFRESH_EXPIRES_IN (7 días) desde que
 *    se emite. Si no se usa en ese plazo, muere sola.
 *  - el ABSOLUTO: SESION_MAX_DIAS (30 por defecto) desde el LOGIN. Antes no existía: como
 *    cada refresh rota y emite otro de 7 días, una sesión que se renovaba seguido (o un
 *    refresh robado que el atacante fuera rotando) no vencía nunca. El inicio se guarda en
 *    cada refresh (`sesionIniciadaAt`) y se hereda en cada rotación, así que renovar no lo
 *    corre.
 *
 * Funciones puras con `ahora` y `maxDias` inyectables: se prueban sin reloj ni entorno.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * SESION_MAX_DIAS (validada en env.ts, default 30). El `?? 30` es para los tests
 * unitarios que mockean `env` sin esta variable; en runtime el schema ya puso el default.
 */
export const maxDiasSesion = (): number => env.SESION_MAX_DIAS ?? 30;

/** Momento en que la sesión iniciada en `inicio` deja de poder renovarse. */
export function finDeSesion(inicio: Date, maxDias: number = maxDiasSesion()): Date {
    return new Date(inicio.getTime() + maxDias * DIA_MS);
}

/** ¿La sesión ya pasó su duración máxima? */
export function sesionPasoElMaximo(inicio: Date, ahora: Date = new Date(), maxDias: number = maxDiasSesion()): boolean {
    return ahora.getTime() >= finDeSesion(inicio, maxDias).getTime();
}

/**
 * Hasta cuándo vale (en la base) un refresh emitido `ahora` para una sesión que empezó en
 * `inicio`: el plazo deslizante de siempre, pero NUNCA más allá del fin de la sesión. Así
 * la fila tampoco sobrevive al tope (y la retención la purga a tiempo).
 *
 * El plazo deslizante se lee como hasta ahora (parseInt de JWT_REFRESH_EXPIRES_IN, en días).
 */
export function vencimientoDelRefresh(inicio: Date, ahora: Date = new Date(), maxDias: number = maxDiasSesion()): Date {
    const deslizante = new Date(ahora);
    deslizante.setDate(deslizante.getDate() + parseInt(config.jwt.refreshExpirationDays));
    const fin = finDeSesion(inicio, maxDias);
    return deslizante.getTime() < fin.getTime() ? deslizante : fin;
}
