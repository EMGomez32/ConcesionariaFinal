import { z } from 'zod';

// z.object descarta lo no declarado (corta mass-assignment). concesionariaId
// opcional para que el super_admin elija tenant (lo resuelve el controller).
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

export const createVehiculoInteresSchema = z.object({
    clienteId: z.coerce.number({ error: 'clienteId es obligatorio' }).int('clienteId inválido').positive('clienteId inválido'),
    vehiculoId: z.coerce.number({ error: 'vehiculoId es obligatorio' }).int('vehiculoId inválido').positive('vehiculoId inválido'),
    nota: z.string().optional(),
    concesionariaId: optionalFk,
});
