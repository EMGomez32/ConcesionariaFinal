import { z } from 'zod';

// Validación de la carga de cotización del dólar. Mismo criterio que el resto de
// schemas: z.object descarta lo no declarado (corta mass-assignment) y
// concesionariaId se declara para que el super_admin pueda elegir tenant por body
// (validate.middleware hace req.body = result.data; sin declararlo, se perdería).

// concesionariaId: la resuelve el controller desde el token para el admin y la
// elige por body el super_admin. 0/''/null => undefined.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

export const upsertCotizacionSchema = z.object({
    // z.coerce.date rechaza fechas inválidas ('2026-13-40', 'abc'). Acepta
    // 'YYYY-MM-DD' (se interpreta como medianoche UTC, que es lo que guarda la
    // columna @db.Date).
    fecha: z.coerce.date({ error: 'fecha inválida (usá el formato YYYY-MM-DD)' }),
    // Pesos por 1 USD: tiene que ser un número mayor a 0. Una cotización <= 0 no
    // existe y además rompería la conversión (división por cero al pasar ARS→USD).
    valor: z.coerce
        .number({ error: 'valor debe ser un número' })
        .positive('valor debe ser mayor a 0'),
    concesionariaId: optionalFk,
});
