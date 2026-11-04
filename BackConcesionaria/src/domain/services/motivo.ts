/**
 * Mínimo de caracteres del MOTIVO de una operación de control (anular una venta,
 * cancelar un contrato o una seña, bajar el precio de lista). Vive en el dominio
 * porque lo usan tanto los schemas (interface) como los casos de uso que lo exigen
 * según el dato (bajar un precio sólo se sabe comparando con el actual).
 */
export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 500;

/** ¿El motivo alcanza? Recorta antes de medir. */
export const motivoSuficiente = (motivo: unknown): boolean =>
    typeof motivo === 'string' && motivo.trim().length >= MOTIVO_MIN;
