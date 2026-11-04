/**
 * Plazos legales para contestar los pedidos de los titulares (Ley 25.326).
 *
 * - Acceso (art. 14): 10 días CORRIDOS desde que se recibe el pedido.
 * - Rectificación, actualización y supresión (art. 16): 5 días HÁBILES.
 * - Bloqueo y oposición: se les aplica el mismo plazo que al art. 16 (el bloqueo está
 *   en ese artículo y la oposición es, en los hechos, un pedido de que dejen de usar
 *   los datos). Es la lectura conservadora; si el asesor legal fija otra, se cambia acá.
 *
 * FERIADOS: no se descuentan. Contar sólo sábados y domingos da un vencimiento IGUAL O
 * ANTERIOR al legal, nunca posterior: la pantalla avisa antes de tiempo, no tarde. Cargar
 * el calendario de feriados nacionales es una mejora pendiente, no un error de plazo.
 *
 * Todo trabaja con fechas de día en UTC (columnas @db.Date), igual que el resto del
 * sistema: sin horas no hay corrimientos por zona horaria.
 */

export type TipoSolicitudTitular = 'acceso' | 'rectificacion' | 'supresion' | 'bloqueo' | 'oposicion';

export const TIPOS_SOLICITUD_TITULAR: readonly TipoSolicitudTitular[] = [
    'acceso', 'rectificacion', 'supresion', 'bloqueo', 'oposicion',
];

export const PLAZO_ACCESO_DIAS_CORRIDOS = 10;
export const PLAZO_RECTIFICACION_DIAS_HABILES = 5;

const DIA_MS = 86_400_000;

/** Reduce cualquier fecha a la medianoche UTC de su día. */
export function aDiaUtc(fecha: Date): Date {
    return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

const esFinDeSemana = (d: Date): boolean => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** Suma `n` días hábiles (lunes a viernes) contando desde el día SIGUIENTE a `desde`. */
export function sumarDiasHabiles(desde: Date, n: number): Date {
    let d = aDiaUtc(desde);
    let restantes = n;
    while (restantes > 0) {
        d = new Date(d.getTime() + DIA_MS);
        if (!esFinDeSemana(d)) restantes--;
    }
    return d;
}

/** Vencimiento legal de un pedido recibido el día `recibidaEl`. */
export function vencimientoLegal(tipo: TipoSolicitudTitular, recibidaEl: Date): Date {
    const dia = aDiaUtc(recibidaEl);
    if (tipo === 'acceso') return new Date(dia.getTime() + PLAZO_ACCESO_DIAS_CORRIDOS * DIA_MS);
    return sumarDiasHabiles(dia, PLAZO_RECTIFICACION_DIAS_HABILES);
}

/** ¿Venció sin resolverse? Un pedido vence al terminar el día de `venceEl`. */
export function estaVencida(
    s: { estado: string; venceEl: Date },
    ahora: Date = new Date(),
): boolean {
    if (s.estado === 'resuelta' || s.estado === 'rechazada') return false;
    return aDiaUtc(ahora).getTime() > aDiaUtc(s.venceEl).getTime();
}
