import { z } from 'zod';

/**
 * MOTIVO de una operación de control (anular una venta, cancelar un contrato o una
 * seña). Lo comparten los schemas para que el mínimo y los textos sean los mismos
 * en todos lados.
 *
 * Por qué un mínimo y no sólo "no vacío": el motivo es lo que el dueño lee después
 * en la auditoría para entender por qué se deshizo una operación con plata. "x",
 * "." o "error" no le dicen nada; diez caracteres alcanzan para "error de carga",
 * "el cliente desistió" o "duplicada con la 1234", y no son una traba para nadie
 * que de verdad tenga un motivo.
 */
export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 500;

/** `que`: de qué es el motivo, con preposición ("de la anulación"). */
export const motivoObligatorio = (que: string) =>
    z.string({ error: `Contá el motivo ${que}` })
        .trim()
        .min(MOTIVO_MIN, `El motivo ${que} tiene que tener al menos ${MOTIVO_MIN} caracteres`)
        .max(MOTIVO_MAX, `El motivo ${que} no puede superar los ${MOTIVO_MAX} caracteres`);

/** Motivo optativo (cuando lo hay, con el mismo tope); '' cuenta como "sin motivo". */
export const motivoOpcional = z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(MOTIVO_MAX, `El motivo no puede superar los ${MOTIVO_MAX} caracteres`).optional(),
);

/**
 * Un DELETE suele llegar SIN body (`req.body` undefined). Sin esto Zod responde
 * "se esperaba un objeto", que no le dice al usuario que lo que falta es el motivo.
 */
export const bodyOVacio = <T extends z.ZodType>(schema: T) =>
    z.preprocess((v) => (v === undefined || v === null ? {} : v), schema);
