import { z } from 'zod';

// Validación de la tasación de un usado. z.object descarta lo no declarado (corta
// mass-assignment). NO se declara `tasadorId`: lo estampa el use case desde el
// token. `concesionariaId` sí (opcional) para que el super_admin elija tenant.

// Espejo del enum CondicionTasacion (prisma/schema.prisma).
const condicionEnum = z.enum(['excelente', 'muy_bueno', 'bueno', 'regular', 'malo'], {
    error: 'Condición inválida. Válidas: excelente, muy_bueno, bueno, regular, malo',
});
const monedaEnum = z.enum(['ARS', 'USD'], { error: 'Moneda inválida (ARS o USD)' });

const optionalStr = z.string().optional();
const optionalInt = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
);
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);
const optionalMonto = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number({ error: 'El valor estimado debe ser un número' }).nonnegative('El valor no puede ser negativo').optional(),
);

export const createTasacionSchema = z.object({
    marca: z.string({ error: 'La marca es obligatoria' }).min(1, 'La marca es obligatoria'),
    modelo: z.string({ error: 'El modelo es obligatorio' }).min(1, 'El modelo es obligatorio'),
    fecha: z.string({ error: 'La fecha es obligatoria' }).min(1, 'La fecha es obligatoria'),
    clienteId: optionalFk,
    anio: optionalInt,
    km: optionalInt,
    dominio: optionalStr,
    condicion: condicionEnum.optional(),
    valorEstimado: optionalMonto,
    moneda: monedaEnum.optional(),
    observaciones: optionalStr,
    concesionariaId: optionalFk,
});
