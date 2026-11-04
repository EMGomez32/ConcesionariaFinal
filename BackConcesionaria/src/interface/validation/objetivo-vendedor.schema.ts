import { z } from 'zod';

// Validación del alta/edición del objetivo mensual de un vendedor. Mismo criterio
// que meta-venta.schema: z.object descarta lo no declarado (corta mass-assignment)
// y concesionariaId se declara para que el super_admin pueda elegir tenant por body.

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
    z.coerce.number().int('El objetivo tiene que ser un número entero').positive('El objetivo tiene que ser mayor a 0').optional(),
);
const optionalPos = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().positive('El objetivo tiene que ser mayor a 0').optional(),
);

export const upsertObjetivoVendedorSchema = z.object({
    vendedorId: z.coerce.number({ error: 'El vendedor es obligatorio' }).int('El vendedor no es válido').positive('El vendedor no es válido'),
    anio: z.coerce.number({ error: 'El año no es válido' }).int('El año no es válido').min(2000, 'El año no es válido').max(2100, 'El año no es válido'),
    mes: z.coerce.number({ error: 'El mes tiene que estar entre 1 y 12' }).int('El mes tiene que estar entre 1 y 12').min(1, 'El mes tiene que estar entre 1 y 12').max(12, 'El mes tiene que estar entre 1 y 12'),
    unidadesObjetivo: optionalIntPos,
    montoObjetivo: optionalPos,
    moneda: z.enum(['ARS', 'USD'], { error: 'Elegí una moneda válida: ARS o USD' }).optional(),
    concesionariaId: optionalFk,
}).refine((d) => d.unidadesObjetivo != null || d.montoObjetivo != null, {
    message: 'Fijá al menos un objetivo: unidades y/o monto facturado',
    path: ['unidadesObjetivo'],
});
