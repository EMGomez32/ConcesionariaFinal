/**
 * Cálculo del CORTE DE LA JORNADA del salón. Módulo PURO: sin prisma, sin env,
 * sin imports. Vive en el dominio para poder testearse sin base (el job de unit
 * tests define sólo un DATABASE_URL dummy y cualquier import que arrastre prisma
 * mata el proceso).
 *
 * Lo consume el worker de cierre automático de atenciones, y la aritmética de
 * fechas es justamente la parte que se rompe en silencio: un error de un día deja
 * atenciones abiertas para siempre, o cierra las de hoy a las nueve de la mañana.
 */

const MS_HORA = 60 * 60 * 1000;
const MS_DIA = 24 * MS_HORA;

/**
 * Instante UTC del corte de jornada VIGENTE para `ahora`.
 *
 * - Si el corte de hoy ya pasó, devuelve el de hoy.
 * - Si todavía no llegó, devuelve el de AYER. Así, a las 9 de la mañana el corte
 *   vigente sigue siendo el de anoche: una atención que quedó abierta ayer se
 *   cierra aunque el proceso haya estado caído toda la noche, y las de HOY —que
 *   son posteriores a ese corte— no se tocan.
 *
 * Se trabaja con un OFFSET FIJO en horas y no con un nombre de zona horaria a
 * propósito: el contenedor puede no traer tzdata, y una zona que no resuelve deja
 * el corte corrido varias horas sin que nadie se entere. Argentina es UTC−3 todo
 * el año (no hay horario de verano desde 2009), así que el offset fijo no pierde
 * nada y no puede fallar.
 *
 * @param hora        hora local del corte, 0..23
 * @param offsetHoras offset del salón respecto de UTC (Argentina: −3)
 */
export function corteDeLaJornada(ahora: Date, hora: number, offsetHoras: number): Date {
    const offsetMs = offsetHoras * MS_HORA;
    // `ahora` leído como si fuera hora local del salón: sumarle el offset y después
    // usar los getters UTC da el año/mes/día LOCALES sin depender del TZ del proceso.
    const local = new Date(ahora.getTime() + offsetMs);
    const corteLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hora, 0, 0, 0);
    const corteUtc = corteLocal - offsetMs;
    if (corteUtc <= ahora.getTime()) return new Date(corteUtc);
    return new Date(corteUtc - MS_DIA);
}

/**
 * Desde cuándo cuenta la ALERTA de "el sistema te cerró N atenciones".
 *
 * NO es el corte vigente. Ese era el bug: el worker corre igual sábados y
 * domingos, así que cada corte que pasaba —con el salón cerrado y sin que nadie
 * entrara al sistema— empujaba la ventana hacia adelante y borraba la alerta. El
 * vendedor que el viernes dejaba 4 atenciones abiertas veía 0 el lunes: la señal
 * que el dueño pidió se perdía todos los fines de semana, más francos y licencias.
 *
 * Se ancla al corte —y no a "ahora menos N días"— para que la ventana empiece
 * siempre en un borde de jornada: si no, el conteo cambiaría según la hora en que
 * el vendedor abra la pantalla.
 *
 * @param corte el corte vigente (ver `corteDeLaJornada`)
 * @param dias  cuántas jornadas hacia atrás mira la alerta
 */
export function ventanaDeAlertaDesde(corte: Date, dias: number): Date {
    return new Date(corte.getTime() - Math.max(0, dias) * MS_DIA);
}
