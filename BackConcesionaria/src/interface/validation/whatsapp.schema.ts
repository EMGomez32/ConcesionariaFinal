import { z } from 'zod';

/**
 * Schemas de las CUENTAS de WhatsApp (los números que se vinculan por QR).
 *
 * Lo de la bandeja se mudó a conversacion.schema.ts cuando la conversación dejó
 * de ser "un hilo de WhatsApp" y pasó a ser multi-canal: los topes de texto y el
 * estado del hilo ya no son de este canal. Acá queda sólo lo que sigue siendo
 * exclusivo del número.
 *
 * Zod descarta las claves no declaradas (validate.middleware reemplaza el body
 * por el parseado) => corta el mass-assignment. Ojo con lo que NO se declara a
 * propósito: `estado`, `numero`, `saludEstado`, `proximoEnvioAt`. Los escribe el
 * socket / el worker anti-ban, nunca el cliente HTTP: aceptarlos por body dejaría
 * a un admin adelantando su propio turno de envío.
 */

// concesionariaId: lo resuelve el controller (resolveConcesionariaId) y el
// super_admin lo elige por body → debe SOBREVIVIR al strip del middleware.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

export const createCuentaSchema = z.object({
    // El alias es cómo se llama el número adentro del panel ("Ventas", "Postventa").
    // Único por concesionaria en la base: un alias repetido devuelve 409.
    alias: z
        .string({ error: 'El alias es obligatorio' })
        .trim()
        .min(1, 'El alias es obligatorio')
        .max(60, 'El alias no puede superar los 60 caracteres'),
    concesionariaId: optionalFk,
});
