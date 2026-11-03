import { z } from 'zod';

// z.object descarta lo no declarado (corta mass-assignment). concesionariaId
// opcional para que el super_admin elija tenant (lo resuelve el controller).
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

export const createVehiculoInteresSchema = z.object({
    clienteId: z.coerce.number({ error: 'El cliente es obligatorio' }).int('El cliente no es válido').positive('El cliente no es válido'),
    vehiculoId: z.coerce.number({ error: 'El vehículo es obligatorio' }).int('El vehículo no es válido').positive('El vehículo no es válido'),
    nota: z.string().optional(),
    concesionariaId: optionalFk,
});
