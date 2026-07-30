import { z } from 'zod';

// Validación de la carga de la meta de ventas del mes. Mismo criterio que el
// resto: z.object descarta lo no declarado (corta mass-assignment) y
// concesionariaId se declara para que el super_admin pueda elegir tenant por body.

// concesionariaId: la resuelve el controller desde el token (admin) o la elige el
// super_admin por body. 0/''/null => undefined.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// Objetivo opcional: '' / null => undefined (no se fijó ese objetivo). Un objetivo
// tiene que ser > 0: fijar 0 no es "un objetivo", así que se rechaza (para "sin
// objetivo" se deja el campo vacío). Con .positive() el 0 no burla el refine.
const optionalIntPos = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int('debe ser un entero').positive('debe ser mayor a 0').optional(),
);
const optionalPos = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().positive('debe ser mayor a 0').optional(),
);

export const upsertMetaVentaSchema = z.object({
    anio: z.coerce.number({ error: 'anio debe ser un entero válido' }).int('anio debe ser un entero válido').min(2000, 'anio debe ser un entero válido').max(2100, 'anio debe ser un entero válido'),
    mes: z.coerce.number({ error: 'mes debe estar entre 1 y 12' }).int('mes debe estar entre 1 y 12').min(1, 'mes debe estar entre 1 y 12').max(12, 'mes debe estar entre 1 y 12'),
    unidadesObjetivo: optionalIntPos,
    montoObjetivo: optionalPos,
    moneda: z.enum(['ARS', 'USD'], { error: 'moneda debe ser ARS o USD' }).optional(),
    concesionariaId: optionalFk,
}).refine((d) => d.unidadesObjetivo != null || d.montoObjetivo != null, {
    message: 'Fijá al menos un objetivo: unidades y/o monto facturado',
    path: ['unidadesObjetivo'],
});
